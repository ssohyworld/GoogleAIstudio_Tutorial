import csv
import json
import os
import re
import uuid
from datetime import datetime
from typing import AsyncGenerator, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import yt_dlp
from google import genai
from google.genai import types
from youtube_transcript_api import YouTubeTranscriptApi

app = FastAPI(title="AI YouTube Searcher (TubeBuddy AI Pro)")

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
CSV_FILE = os.path.join(BASE_DIR, "transcripts_database.csv")

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/downloads", StaticFiles(directory=DOWNLOAD_DIR), name="downloads")

CONDA_FFMPEG_DIR = "/opt/anaconda3/envs/myenv/bin"
FFMPEG_PATH = os.path.join(CONDA_FFMPEG_DIR, "ffmpeg") if os.path.exists(os.path.join(CONDA_FFMPEG_DIR, "ffmpeg")) else None

CSV_HEADERS = [
    "video_id",
    "url",
    "title",
    "uploader",
    "duration",
    "duration_string",
    "source_type",
    "created_at",
    "transcript",
    "chapters_json",
    "bookmarks_json"
]


def load_transcripts_from_csv() -> dict:
    """CSV 파일에서 저장된 모든 트랜스크립트와 챕터/북마크 데이터를 읽어옵니다."""
    cache = {}
    if not os.path.exists(CSV_FILE):
        return cache
    try:
        with open(CSV_FILE, mode="r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                vid = row.get("video_id")
                if vid:
                    chapters = []
                    bookmarks = []
                    try:
                        chapters = json.loads(row.get("chapters_json", "[]"))
                    except Exception:
                        pass
                    try:
                        bookmarks = json.loads(row.get("bookmarks_json", "[]"))
                    except Exception:
                        pass
                    cache[vid] = {
                        "video_id": vid,
                        "url": row.get("url", ""),
                        "title": row.get("title", ""),
                        "uploader": row.get("uploader", ""),
                        "duration": int(row.get("duration", 0) or 0),
                        "duration_string": row.get("duration_string", ""),
                        "source_type": row.get("source_type", "Gemini 3.5 STT"),
                        "created_at": row.get("created_at", ""),
                        "transcript": row.get("transcript", ""),
                        "chapters": chapters,
                        "bookmarks": bookmarks,
                    }
    except Exception as e:
        print(f"Error loading CSV cache: {e}")
    return cache


def save_transcript_to_csv(data: dict):
    """트랜스크립트 및 챕터 정보를 CSV 파일에 저장하고 캐시를 업데이트합니다."""
    vid = data.get("video_id")
    if not vid:
        return

    TRANSCRIPT_CACHE[vid] = data

    existing_rows = {}
    if os.path.exists(CSV_FILE):
        try:
            with open(CSV_FILE, mode="r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    if r.get("video_id"):
                        existing_rows[r["video_id"]] = r
        except Exception:
            pass

    chapters_str = json.dumps(data.get("chapters", []), ensure_ascii=False)
    bookmarks_str = json.dumps(data.get("bookmarks", []), ensure_ascii=False)
    row_dict = {
        "video_id": vid,
        "url": data.get("url", ""),
        "title": data.get("title", ""),
        "uploader": data.get("uploader", ""),
        "duration": data.get("duration", 0),
        "duration_string": data.get("duration_string", ""),
        "source_type": data.get("source_type", "Gemini 3.5 STT"),
        "created_at": data.get("created_at") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "transcript": data.get("transcript", ""),
        "chapters_json": chapters_str,
        "bookmarks_json": bookmarks_str,
    }
    existing_rows[vid] = row_dict

    with open(CSV_FILE, mode="w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        writer.writeheader()
        for r in existing_rows.values():
            writer.writerow(r)


# Initialize Cache from CSV on server start
TRANSCRIPT_CACHE = load_transcripts_from_csv()


def extract_youtube_subtitles_plugin(video_id: str) -> Optional[str]:
    """유튜브 자막 플러그인(API)을 통해 고속/무료로 타임스탬프 자막을 가져옵니다."""
    try:
        ytt = YouTubeTranscriptApi()
        transcript_list = ytt.list(video_id=video_id)
        # Try Korean first, then English, then any available language
        transcript_obj = None
        try:
            transcript_obj = transcript_list.find_transcript(["ko", "ko-KR"])
        except Exception:
            try:
                transcript_obj = transcript_list.find_transcript(["en", "en-US"])
            except Exception:
                # Get the first available transcript
                for t in transcript_list:
                    transcript_obj = t
                    break

        if transcript_obj:
            data = transcript_obj.fetch()
            formatted_lines = []
            for item in data:
                start_sec = int(item.start)
                m = start_sec // 60
                s = start_sec % 60
                ts = f"[{m:02d}:{s:02d}]"
                text = item.text.replace("\n", " ").strip()
                if text:
                    formatted_lines.append(f"{ts} {text}")
            return "\n".join(formatted_lines)
    except Exception as e:
        print(f"YouTube Subtitle Plugin fetch note for {video_id}: {e}")
    return None


class VideoUrlRequest(BaseModel):
    url: str


class AskQuestionRequest(BaseModel):
    video_id: str
    question: str
    transcript: Optional[str] = ""


class BookmarkRequest(BaseModel):
    video_id: str
    timestamp_seconds: int
    timestamp_str: str
    memo: str


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
    """유튜브 영상 정보 조회 및 캐시 여부 반환"""
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="유튜브 URL을 입력해주세요.")

    vid_id = extract_youtube_id(url)
    cached_item = TRANSCRIPT_CACHE.get(vid_id) if vid_id else None

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
                "is_cached": bool(video_id in TRANSCRIPT_CACHE),
            }
    except Exception as e:
        if vid_id:
            return {
                "id": vid_id,
                "title": cached_item["title"] if cached_item else "YouTube Video",
                "thumbnail": f"https://img.youtube.com/vi/{vid_id}/maxresdefault.jpg",
                "duration": cached_item["duration"] if cached_item else 0,
                "duration_string": cached_item["duration_string"] if cached_item else "",
                "uploader": cached_item["uploader"] if cached_item else "YouTube",
                "view_count": 0,
                "is_cached": bool(vid_id in TRANSCRIPT_CACHE),
            }
        raise HTTPException(status_code=400, detail=f"영상 정보를 가져오지 못했습니다: {str(e)}")


@app.post("/api/process_video")
async def process_video(request: VideoUrlRequest):
    """
    3단계 하이브리드 트랜스크립트 추출 파이프라인:
    1단계: CSV 데이터베이스 캐시 확인 (0.01초)
    2단계: 유튜브 자막 플러그인 API 추출 (0.2초, $0)
    3단계: Gemini 3.5 Transcribe 고정밀 음성 STT (자막 없는 영상 대상)
    """
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="유튜브 URL을 입력해주세요.")

    video_id = extract_youtube_id(url)
    api_key = os.environ.get("GEMINI_API_KEY")

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            # 1단계: CSV 캐시 최신 동기화 및 확인
            TRANSCRIPT_CACHE.update(load_transcripts_from_csv())
            if video_id and video_id in TRANSCRIPT_CACHE and TRANSCRIPT_CACHE[video_id].get("transcript"):
                cached = TRANSCRIPT_CACHE[video_id]
                yield f"data: {json.dumps({'status': 'progress', 'message': '⚡ CSV 데이터베이스 캐시에서 0.1초 만에 불러왔습니다!'})}\n\n"
                yield f"data: {json.dumps({'status': 'done', 'video_id': video_id, 'transcript': cached['transcript'], 'chapters': cached['chapters'], 'bookmarks': cached.get('bookmarks', []), 'source_type': 'CSV 캐시', 'cached': True, 'title': cached['title'], 'uploader': cached['uploader']})}\n\n"
                return

            # 영상 메타데이터 사전 획득
            video_title = "YouTube Video"
            video_uploader = "YouTube"
            video_duration = 0
            video_duration_str = ""

            try:
                with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True}) as ydl:
                    info = ydl.extract_info(url, download=False)
                    video_title = info.get("title", "YouTube Video")
                    video_uploader = info.get("uploader", "YouTube")
                    video_duration = info.get("duration", 0)
                    video_duration_str = info.get("duration_string", "")
            except Exception:
                pass

            # 2단계: 유튜브 공식 자막 플러그인 확인
            yield f"data: {json.dumps({'status': 'progress', 'message': '1/3 유튜브 자막 플러그인에서 타임스탬프 추출 시도 중...'})}\n\n"
            plugin_transcript = extract_youtube_subtitles_plugin(video_id) if video_id else None

            transcript_text = ""
            source_type = ""

            if plugin_transcript and len(plugin_transcript) > 50:
                transcript_text = plugin_transcript
                source_type = "유튜브 자막 플러그인"
                yield f"data: {json.dumps({'status': 'progress', 'message': '⚡ 유튜브 공식 자막을 고속으로 가져왔습니다!'})}\n\n"
            else:
                # 3단계: Gemini 3.5 Transcribe 오디오 STT
                if not api_key:
                    yield f"data: {json.dumps({'status': 'error', 'message': 'GEMINI_API_KEY가 설정되지 않았습니다.'})}\n\n"
                    return

                yield f"data: {json.dumps({'status': 'progress', 'message': '2/3 유튜브 오디오 스트림 다운로드 중...'})}\n\n"

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

                file_path = expected_filename
                mime_type = "audio/mp3" if file_path.endswith(".mp3") else "audio/mp4"

                yield f"data: {json.dumps({'status': 'progress', 'message': '3/3 Gemini 3.5 Transcribe로 고정밀 음성 전사 중...'})}\n\n"

                client = genai.Client(api_key=api_key)
                with open(file_path, "rb") as f:
                    audio_bytes = f.read()

                audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
                stt_prompt = (
                    "Transcribe this entire audio in detail. "
                    "Include speaker tags and precise timestamps for every sentence in [MM:SS] format. "
                    "Output clear timestamps so moments can be accurately navigated."
                )

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
                    source_type = "Gemini 3.5 STT"
                except Exception:
                    response = client.models.generate_content(
                        model="gemini-3.6-flash",
                        contents=[audio_part, types.Part.from_text(text=stt_prompt)]
                    )
                    transcript_text = response.text or ""
                    source_type = "Gemini 3.6 Flash STT"

            # 챕터 생성
            yield f"data: {json.dumps({'status': 'progress', 'message': '✨ 영상 주요 하이라이트 챕터 생성 중...'})}\n\n"

            chapters_json = []
            if api_key:
                try:
                    client = genai.Client(api_key=api_key)
                    chapter_prompt = f"""Based on this video transcript, extract 4 to 6 key highlights or chapters.
Return ONLY a valid JSON array of objects with the following schema:
[
  {{
    "title": "Short catchy title (under 20 chars)",
    "timestamp_str": "MM:SS",
    "timestamp_seconds": 45,
    "category": "Topic or mood (e.g. 💡 핵심 요약, 🍕 음식, 🚗 여행, 🎬 하이라이트, ❤️ 리뷰)",
    "color": "lavender",
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
                    chapters_json = json.loads(chapter_res.text)
                except Exception:
                    pass

            if not chapters_json:
                chapters_json = [
                    {"title": "영상 시작", "timestamp_str": "00:00", "timestamp_seconds": 0, "category": "🎬 시작", "color": "lime", "summary": "영상의 도입부입니다."},
                    {"title": "주요 내용", "timestamp_str": "00:30", "timestamp_seconds": 30, "category": "💡 핵심", "color": "lavender", "summary": "영상에서 다루는 주요 포인트입니다."}
                ]

            # Save to CSV Database
            save_data = {
                "video_id": video_id,
                "url": url,
                "title": video_title,
                "uploader": video_uploader,
                "duration": video_duration,
                "duration_string": video_duration_str,
                "source_type": source_type,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "transcript": transcript_text,
                "chapters": chapters_json,
                "bookmarks": [],
            }
            save_transcript_to_csv(save_data)

            yield f"data: {json.dumps({'status': 'done', 'video_id': video_id, 'transcript': transcript_text, 'chapters': chapters_json, 'bookmarks': [], 'source_type': source_type, 'cached': False, 'created_at': save_data['created_at']})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/bookmarks/add")
async def add_bookmark(request: BookmarkRequest):
    """사용자가 직접 찍은 커스텀 타임스탬프 북마크 저장"""
    vid = request.video_id
    if vid not in TRANSCRIPT_CACHE:
        TRANSCRIPT_CACHE[vid] = {
            "video_id": vid,
            "url": f"https://youtu.be/{vid}",
            "title": "YouTube Video",
            "uploader": "YouTube",
            "duration": 0,
            "duration_string": "",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "transcript": "",
            "chapters": [],
            "bookmarks": [],
        }

    bookmark_item = {
        "id": str(uuid.uuid4())[:8],
        "timestamp_seconds": request.timestamp_seconds,
        "timestamp_str": request.timestamp_str,
        "memo": request.memo or "중요한 순간",
        "created_at": datetime.now().strftime("%H:%M:%S")
    }

    if "bookmarks" not in TRANSCRIPT_CACHE[vid]:
        TRANSCRIPT_CACHE[vid]["bookmarks"] = []

    TRANSCRIPT_CACHE[vid]["bookmarks"].append(bookmark_item)
    save_transcript_to_csv(TRANSCRIPT_CACHE[vid])

    return {"status": "ok", "bookmarks": TRANSCRIPT_CACHE[vid]["bookmarks"]}


@app.post("/api/bookmarks/delete")
async def delete_bookmark(video_id: str, bookmark_id: str):
    """타임스탬프 북마크 삭제"""
    if video_id in TRANSCRIPT_CACHE:
        bookmarks = TRANSCRIPT_CACHE[video_id].get("bookmarks", [])
        TRANSCRIPT_CACHE[video_id]["bookmarks"] = [b for b in bookmarks if b.get("id") != bookmark_id]
        save_transcript_to_csv(TRANSCRIPT_CACHE[video_id])
        return {"status": "ok", "bookmarks": TRANSCRIPT_CACHE[video_id]["bookmarks"]}
    return {"status": "error", "message": "Video not found"}


@app.post("/api/ask")
async def ask_question(request: AskQuestionRequest):
    """Gemini 3.8 Flash를 활용한 영상 내용 검색 & 시간 위치 찾기 (Q&A)"""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY가 설정되지 않았습니다.")

    cached = TRANSCRIPT_CACHE.get(request.video_id, {})
    transcript = request.transcript or cached.get("transcript", "")
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


@app.get("/api/download_csv")
async def download_csv():
    """저장된 전체 트랜스크립트 CSV 파일 다운로드"""
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, mode="w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
            writer.writeheader()
    return FileResponse(
        CSV_FILE,
        media_type="text/csv",
        filename="youtube_transcripts_database.csv",
        headers={"Content-Disposition": "attachment; filename=youtube_transcripts_database.csv"}
    )


@app.get("/api/history")
async def get_history():
    """CSV에 저장된 영상 목록 조회"""
    items = []
    for vid, item in TRANSCRIPT_CACHE.items():
        items.append({
            "video_id": vid,
            "url": item.get("url"),
            "title": item.get("title"),
            "uploader": item.get("uploader"),
            "duration_string": item.get("duration_string"),
            "source_type": item.get("source_type", "Gemini 3.5 STT"),
            "created_at": item.get("created_at"),
            "chapters_count": len(item.get("chapters", [])),
            "bookmarks_count": len(item.get("bookmarks", [])),
        })
    return {"count": len(items), "items": items}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=True)
