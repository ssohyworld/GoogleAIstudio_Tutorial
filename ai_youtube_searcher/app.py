import json
import os
import re
import uuid
import mimetypes
from typing import AsyncGenerator, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import yt_dlp
from google import genai
from google.genai import types

app = FastAPI(title="AI YouTube Searcher (TubeBuddy AI)")

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

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")

CONDA_FFMPEG_DIR = "/opt/anaconda3/envs/myenv/bin"
FFMPEG_PATH = os.path.join(CONDA_FFMPEG_DIR, "ffmpeg") if os.path.exists(os.path.join(CONDA_FFMPEG_DIR, "ffmpeg")) else None

# In-memory transcript storage by video_id
TRANSCRIPT_STORE = {}


class VideoUrlRequest(BaseModel):
    url: str


class AskQuestionRequest(BaseModel):
    video_id: str
    question: str
    transcript: Optional[str] = ""


@app.get("/")
async def root():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


def extract_youtube_id(url: str) -> Optional[str]:
    """유튜브 URL에서 11자리 비디오 ID 추출"""
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'youtu\.be\/([0-9A-Za-z_-]{11})',
        r'shorts\/([0-9A-Za-z_-]{11})'
    ]
    for p in patterns:
        match = re.search(p, url)
        if match:
            return match.group(1)
    return None


@app.post("/api/info")
async def get_video_info(request: VideoUrlRequest):
    """유튜브 영상 정보 조회"""
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="유튜브 URL을 입력해주세요.")

    vid_id = extract_youtube_id(url)

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            video_id = info.get("id") or vid_id
            return {
                "id": video_id,
                "title": info.get("title"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration", 0),
                "duration_string": info.get("duration_string", ""),
                "uploader": info.get("uploader", "Unknown Channel"),
                "view_count": info.get("view_count", 0),
            }
    except Exception as e:
        if vid_id:
            return {
                "id": vid_id,
                "title": "YouTube Video",
                "thumbnail": f"https://img.youtube.com/vi/{vid_id}/maxresdefault.jpg",
                "duration": 0,
                "duration_string": "",
                "uploader": "YouTube",
                "view_count": 0,
            }
        raise HTTPException(status_code=400, detail=f"영상 정보를 가져오지 못했습니다: {str(e)}")


@app.post("/api/process_video")
async def process_video(request: VideoUrlRequest):
    """오디오 다운로드 및 Gemini 3.5 Transcribe STT + 챕터 추출 (SSE 스트리밍)"""
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="유튜브 URL을 입력해주세요.")

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY가 설정되지 않았습니다.")

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            yield f"data: {json.dumps({'status': 'progress', 'message': '1/3 유튜브 오디오 스트림 추출 중...'})}\n\n"

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

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                expected_filename = ydl.prepare_filename(info)
                if FFMPEG_PATH:
                    base, _ = os.path.splitext(expected_filename)
                    if os.path.exists(f"{base}.mp3"):
                        expected_filename = f"{base}.mp3"

            video_id = info.get("id") or extract_youtube_id(url)
            file_path = expected_filename
            mime_type = "audio/mp3" if file_path.endswith(".mp3") else "audio/mp4"

            yield f"data: {json.dumps({'status': 'progress', 'message': '2/3 Gemini 3.5 Transcribe로 음성 전사 중...'})}\n\n"

            client = genai.Client(api_key=api_key)
            with open(file_path, "rb") as f:
                audio_bytes = f.read()

            audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
            stt_prompt = (
                "Transcribe this entire audio in detail. "
                "Include speaker tags and precise timestamps for every sentence in [MM:SS] format. "
                "Output clear timestamps so moments can be accurately navigated."
            )

            # Transcribe with Gemini 3.5
            transcript_text = ""
            try:
                config = types.GenerateContentConfig(
                    audio_transcription_config=types.AudioTranscriptionConfig(
                        word_timestamp=True,
                        diarization=True
                    )
                )
                response = client.models.generate_content(
                    model="gemini-3.5-transcribe",
                    contents=[audio_part, types.Part.from_text(text=stt_prompt)],
                    config=config
                )
                transcript_text = response.text or ""
            except Exception:
                # Fallback to flash multimodal
                response = client.models.generate_content(
                    model="gemini-3.6-flash",
                    contents=[audio_part, types.Part.from_text(text=stt_prompt)]
                )
                transcript_text = response.text or ""

            # Store in cache
            TRANSCRIPT_STORE[video_id] = transcript_text

            yield f"data: {json.dumps({'status': 'transcript', 'text': transcript_text})}\n\n"
            yield f"data: {json.dumps({'status': 'progress', 'message': '3/3 영상 주요 챕터 및 하이라이트 생성 중...'})}\n\n"

            # Extract 4-6 pastel chapter cards
            chapter_prompt = f"""Based on this video transcript, extract 4 to 6 key highlights or chapters.
Return ONLY a valid JSON array of objects with the following schema:
[
  {{
    "title": "Short catchy title (under 20 chars)",
    "timestamp_str": "MM:SS",
    "timestamp_seconds": 45,
    "category": "Topic or mood (e.g. 💡 핵심 요약, 🍕 음식, 🚗 여행, 🎬 하이라이트, ❤️ 리뷰)",
    "color": "lavender" (choose from: "lavender", "sky", "lime", "peach", "pink"),
    "summary": "1 sentence brief summary of what happened here"
  }}
]

Transcript:
{transcript_text[:12000]}
"""
            chapter_res = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=chapter_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )

            chapters_json = []
            try:
                chapters_json = json.loads(chapter_res.text)
            except Exception:
                chapters_json = [
                    {"title": "영상 시작", "timestamp_str": "00:00", "timestamp_seconds": 0, "category": "🎬 시작", "color": "lime", "summary": "영상의 도입부입니다."},
                    {"title": "주요 내용", "timestamp_str": "00:30", "timestamp_seconds": 30, "category": "💡 핵심", "color": "lavender", "summary": "영상에서 다루는 주요 포인트입니다."}
                ]

            yield f"data: {json.dumps({'status': 'done', 'video_id': video_id, 'transcript': transcript_text, 'chapters': chapters_json})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/ask")
async def ask_question(request: AskQuestionRequest):
    """Gemini 3.8 Flash를 활용한 영상 내용 검색 & 시간 위치 찾기 (Q&A)"""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY가 설정되지 않았습니다.")

    transcript = request.transcript or TRANSCRIPT_STORE.get(request.video_id, "")
    if not transcript:
        raise HTTPException(status_code=400, detail="해당 영상의 트랜스크립트 데이터가 없습니다. 먼저 영상 분석을 진행해주세요.")

    prompt = f"""You are 'TubeBuddy AI', a friendly and smart YouTube video assistant.
The user is asking a question about a YouTube video. You have the full transcript with timestamps.

Your Task:
1. Answer the user's question clearly and accurately in Korean based on the transcript.
2. Find the exact timestamp (e.g., [01:23] or [00:45]) where this topic is mentioned in the video so the user can jump and watch it.
3. Include the clickable timestamp marker `[MM:SS]` in your response text.
4. Also return the primary target timestamp in seconds as an integer for auto-seeking.

User Question: {request.question}

Transcript:
{transcript}

Return your answer in the following JSON format:
{{
  "answer": "친절한 설명과 함께 [MM:SS] 타임스탬프를 포함한 답변",
  "target_seconds": 83,
  "timestamp_str": "01:23",
  "matched_quote": "대본에서 인용한 핵심 문장"
}}
"""

    try:
        client = genai.Client(api_key=api_key)
        # Try gemini-3.8-flash, fallback to gemini-3.6-flash
        model_name = "gemini-3.8-flash"
        try:
            res = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
        except Exception:
            model_name = "gemini-3.6-flash"
            res = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )

        data = json.loads(res.text)
        return {
            "model": model_name,
            "answer": data.get("answer", "답변을 생성하지 못했습니다."),
            "target_seconds": data.get("target_seconds", 0),
            "timestamp_str": data.get("timestamp_str", "00:00"),
            "matched_quote": data.get("matched_quote", "")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 답변 생성 중 오류: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=True)
