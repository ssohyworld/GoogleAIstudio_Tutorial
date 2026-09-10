# 🎥 YouTube Audio Downloader & Gemini STT Web Service

유튜브 영상 URL을 입력하면 오디오를 다운로드하고, Google의 최신 **Gemini 3.5 Transcribe** 모델을 활용하여 실시간 스트리밍으로 트랜스크립트(자막/대본)를 추출해 주는 웹 애플리케이션입니다.

---

## 🏗️ 서비스 아키텍처 (Architecture)

### 1. 시스템 구성도 (System Architecture)

```mermaid
flowchart TB
    subgraph Client["🖥️ 웹 브라우저 (Client)"]
        UI["웹 UI (Tailwind CSS + JS)"]
        Player["오디오 플레이어 (HTML5 Audio)"]
        Viewer["트랜스크립트 뷰어 (실시간 SSE 수신)"]
    end

    subgraph Backend["⚡ FastAPI 백엔드 서버"]
        Router["API 라우터 (/api)"]
        YTDLP["yt-dlp 오디오 다운로더"]
        Storage[("임시 저장소 (/downloads)")]
        GenAIClient["Google GenAI SDK Client"]
    end

    subgraph External["🌐 외부 서비스"]
        YouTube[("YouTube 서버")]
        GeminiCloud["Google AI Studio (Gemini 3.5 Transcribe)"]
    end

    %% Client to Backend
    UI -->|"1. URL 입력 및 정보 요청 (/api/info)"| Router
    UI -->|"2. 오디오 다운로드 요청 (/api/download)"| Router
    UI -->|"3. STT 변환 요청 (/api/transcribe)"| Router
    Router -->|"오디오 스트리밍 제공"| Player
    Router -->|"SSE 실시간 텍스트 스트리밍"| Viewer

    %% Backend to External
    Router --> YTDLP
    YTDLP -->|"오디오 스트림 추출"| YouTube
    YTDLP -->|"오디오 파일 저장 (.m4a/.mp3)"| Storage
    Storage -->|"오디오 바이트 로드"| GenAIClient
    GenAIClient -->|"멀티모달 오디오 전송 (Diarization/Timestamp)"| GeminiCloud
    GeminiCloud -->|"스트리밍 응답 (Chunks)"| GenAIClient
    GenAIClient --> Router
```

---

### 2. 데이터 흐름 시퀀스 (Data Flow Sequence)

```mermaid
sequenceDiagram
    autonumber
    actor User as 사용자 (Web Browser)
    participant Server as FastAPI Server
    participant YTDLP as yt-dlp
    participant YouTube as YouTube
    participant Gemini as Google Gemini 3.5 Transcribe

    User->>Server: 유튜브 URL 입력 및 정보 요청 (/api/info)
    Server->>YTDLP: 영상 메타데이터 추출
    YTDLP->>YouTube: 메타데이터 쿼리
    YouTube-->>YTDLP: 제목, 썸네일, 길이 반환
    YTDLP-->>Server: 메타데이터 전달
    Server-->>User: 썸네일 및 영상 정보 표시

    User->>Server: 오디오 다운로드 요청 (/api/download)
    Server->>YTDLP: 오디오 스트림 다운로드 실행
    YTDLP->>YouTube: 오디오 데이터 요청
    YouTube-->>YTDLP: 오디오 스트림 응답
    YTDLP-->>Server: 로컬 /downloads 폴더에 저장
    Server-->>User: 다운로드 완료 & 오디오 플레이어 로드

    User->>Server: Gemini STT 요청 (/api/transcribe)
    Server->>Server: 로컬 오디오 바이너리 로드
    Server->>Gemini: types.Part.from_bytes + Diarization 옵션 전달
    loop 실시간 스트리밍
        Gemini-->>Server: 텍스트 청크 스트리밍 응답
        Server-->>User: SSE (Server-Sent Events)로 실시간 화면 출력
    end
    Server-->>User: 변환 완료 (복사 및 .txt 다운로드 가능)
```

---

## ✨ 주요 기능

1. **YouTube 영상 정보 조회 및 오디오 다운로드**:
   - `yt-dlp`를 통해 영상 제목, 썸네일, 길이 등을 미리보기로 제공
   - 최고 품질의 오디오 스트림을 자동 다운로드
2. **웹 오디오 플레이어**:
   - 추출된 오디오 파일을 웹 브라우저에서 즉시 재생 및 탐색 가능
3. **Gemini 3.5 Transcribe 음성 인식 (STT)**:
   - 화자 분리 (Diarization: Speaker 구분)
   - 단어별 정밀 타임스탬프 (Word Timestamp)
   - 실시간 SSE(Server-Sent Events) 스트리밍 출력
4. **편의 기능**:
   - 추출된 전체 텍스트 원클릭 클립보드 복사
   - 영상 제목 기반 `.txt` 파일 다운로드

---

## 🚀 빠른 시작 가이드

### 1. 가상환경 활성화 및 필수 패키지 설치
```bash
conda activate myenv

cd /Users/sohyunkim/Desktop/Project/GoogleAIstudio_Tutorial/youtube_stt_service
pip install -r requirements.txt
```

### 2. Gemini API Key 환경변수 확인
```bash
export GEMINI_API_KEY="your_api_key_here"
```

### 3. 웹 서버 실행
```bash
python app.py
```
또는
```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 4. 웹 브라우저 접속
브라우저에서 아래 주소로 접속합니다:
👉 **`http://localhost:8000`**

---

## 🛠️ 기술 스택
- **Backend**: FastAPI, Uvicorn, yt-dlp, Google GenAI SDK (`gemini-3.5-transcribe`)
- **Frontend**: HTML5, Tailwind CSS, Lucide Icons, Vanilla JavaScript (SSE Reader)
