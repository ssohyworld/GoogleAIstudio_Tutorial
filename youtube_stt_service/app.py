import json
import os
import uuid
import mimetypes
from typing import AsyncGenerator
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import yt_dlp
from google import genai
from google.genai import types

app = FastAPI(title="YouTube Audio Downloader & Gemini STT")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Mount static files and downloads
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")

# Detect ffmpeg in conda env or PATH
CONDA_FFMPEG_DIR = "/opt/anaconda3/envs/myenv/bin"
FFMPEG_PATH = os.path.join(CONDA_FFMPEG_DIR, "ffmpeg") if os.path.exists(os.path.join(CONDA_FFMPEG_DIR, "ffmpeg")) else None


class VideoInfoRequest(BaseModel):
    url: str


class TranscribeRequest(BaseModel):
    filename: str
    diarization: bool = True
    word_timestamp: bool = True
    language_prompt: str = ""


@app.get("/")
async def root():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.post("/api/info")
async def get_video_info(request: VideoInfoRequest):
    """유튜브 영상 메타데이터(제목, 썸네일, 길이 등) 조회"""
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="유튜브 URL을 입력해주세요.")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "id": info.get("id"),
                "title": info.get("title"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration", 0),
                "duration_string": info.get("duration_string", ""),
                "uploader": info.get("uploader", "Unknown"),
                "view_count": info.get("view_count", 0),
            }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"영상 정보를 불러오는 중 오류가 발생했습니다: {str(e)}"
        )


@app.post("/api/download")
async def download_audio(request: VideoInfoRequest):
    """유튜브 오디오 다운로드 (MP3 / M4A 변환)"""
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="유튜브 URL을 입력해주세요.")

    file_id = str(uuid.uuid4())[:8]
    out_template = os.path.join(DOWNLOAD_DIR, f"{file_id}_%(id)s.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "quiet": True,
        "no_warnings": True,
    }

    if FFMPEG_PATH:
        ydl_opts["ffmpeg_location"] = CONDA_FFMPEG_DIR
        ydl_opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }]

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            # If converted to mp3, the extension changes
            expected_filename = ydl.prepare_filename(info)
            if FFMPEG_PATH:
                base, _ = os.path.splitext(expected_filename)
                if os.path.exists(f"{base}.mp3"):
                    expected_filename = f"{base}.mp3"

            base_filename = os.path.basename(expected_filename)
            file_size = os.path.getsize(expected_filename)

            return {
                "filename": base_filename,
                "title": info.get("title"),
                "duration": info.get("duration", 0),
                "file_size": file_size,
                "audio_url": f"/downloads/{base_filename}",
            }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"오디오 다운로드에 실패했습니다: {str(e)}"
        )


@app.post("/api/transcribe")
async def transcribe_audio(request: TranscribeRequest):
    """Gemini 3.5 Transcribe를 활용한 실시간 스트리밍 음성 인식 (SSE)"""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="서버에 GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다."
        )

    file_path = os.path.join(DOWNLOAD_DIR, request.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="오디오 파일을 찾을 수 없습니다.")

    # MIME 타입 확인
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type or not mime_type.startswith("audio/"):
        if file_path.endswith(".m4a"):
            mime_type = "audio/mp4"
        elif file_path.endswith(".mp3"):
            mime_type = "audio/mp3"
        elif file_path.endswith(".wav"):
            mime_type = "audio/wav"
        elif file_path.endswith(".webm"):
            mime_type = "audio/webm"
        else:
            mime_type = "audio/mp3"

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            client = genai.Client(api_key=api_key)
            file_size = os.path.getsize(file_path)

            yield f"data: {json.dumps({'status': 'progress', 'message': '오디오 데이터 로딩 중...'})}\n\n"

            # 20MB 초과 시 File API 사용, 이하 시 Part.from_bytes 직접 전달
            if file_size > 20 * 1024 * 1024:
                yield f"data: {json.dumps({'status': 'progress', 'message': '대용량 파일 업로드 중...'})}\n\n"
                uploaded_file = client.files.upload(file=file_path)
                audio_part = types.Part.from_uri(
                    file_uri=uploaded_file.uri,
                    mime_type=uploaded_file.mime_type
                )
            else:
                with open(file_path, "rb") as f:
                    audio_bytes = f.read()
                audio_part = types.Part.from_bytes(
                    data=audio_bytes,
                    mime_type=mime_type,
                )

            prompt_text = "Generate a full and precise transcript of this audio. Include timestamps and speaker labels if available."
            if request.language_prompt:
                prompt_text += f" {request.language_prompt}"

            contents = [
                types.Content(
                    role="user",
                    parts=[
                        audio_part,
                        types.Part.from_text(text=prompt_text),
                    ],
                ),
            ]

            config = types.GenerateContentConfig(
                audio_transcription_config=types.AudioTranscriptionConfig(
                    word_timestamp=request.word_timestamp,
                    diarization=request.diarization,
                ),
            )

            yield f"data: {json.dumps({'status': 'progress', 'message': 'Gemini 3.5 Transcribe 분석 중...'})}\n\n"

            # 스트리밍 텍스트 전달
            for chunk in client.models.generate_content_stream(
                model="gemini-3.5-transcribe",
                contents=contents,
                config=config,
            ):
                if chunk.text:
                    yield f"data: {json.dumps({'status': 'text', 'chunk': chunk.text})}\n\n"

            yield f"data: {json.dumps({'status': 'done', 'message': '트랜스크립션 완료'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
