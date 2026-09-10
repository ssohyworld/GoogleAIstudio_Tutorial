# 🎬 TubeBuddy AI — AI 유튜브 스마트 검색기

Google AI Studio의 **Gemini 3.5 Transcribe** (고정밀 음성 전사) 및 **Gemini 3.8 Flash** (영상 내용 검색 & 타임스탬프 탐색) 모델을 활용한 차세대 인터랙티브 유튜브 검색 웹 서비스입니다.

---

## 🎨 UI/UX 디자인 컨셉 ('Buddy' 스타일)

- **파스텔톤 네오 브루탈리즘**: 라벤더, 스카이블루, 소프트 라임, 피치 컬러의 둥근 모바일 카드 인터페이스
- **상단 네온 라임 검색 바**: 유튜브 URL 입력 및 원클릭 탐색
- **유튜브 IFrame 플레이어 & 커스텀 볼륨 조절**: 0% ~ 100% 음향 조절 및 음소거 토글
- **가로 스크롤 하이라이트 챕터 카드**: 클릭 시 해당 시간 위치로 영상 즉시 점프(Seek)
- **AI 대화형 내용 검색**: 질문 시 AI가 설명과 함께 정확한 시간대(`[01:23]`)를 찾아서 영상을 자동 재생

---

## 🚀 실행 방법

### 1. 가상환경 활성화 및 API Key 설정
```zsh
conda activate myenv
export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```

### 2. 서버 실행
```zsh
cd /Users/sohyunkim/Desktop/Project/GoogleAIstudio_Tutorial/ai_youtube_searcher
python app.py
```

### 3. 브라우저 접속
👉 **http://localhost:8001**

---

## 🏗️ 아키텍처 다이어그램

```mermaid
flowchart TD
    User([👤 사용자]) -->|1. 유튜브 URL 입력| Front["📱 TubeBuddy UI (FastAPI Static)"]
    Front -->|2. /api/process_video| Back["⚡ FastAPI Backend"]
    Back -->|3. yt-dlp| Audio["🔊 오디오 추출 (.mp3)"]
    Audio -->|4. 단어별 타임스탬프 전사| STT["✨ Gemini 3.5 Transcribe"]
    STT -->|5. 트랜스크립트 & 챕터 생성| Back
    Back -->|6. SSE 스트림 전송| Front
    
    User -->|7. '이 부분 어디서 나와?' 질의| Front
    Front -->|8. /api/ask| QA["🤖 Gemini 3.8 Flash"]
    QA -->|9. 답변 + 타임스탬프(sec)| Front
    Front -->|10. player.seekTo(sec)| YT["🎬 YouTube Player 자동 재생"]
```

---

## 📡 API 엔드포인트

| Method | Endpoint | 설명 |
| :--- | :--- | :--- |
| `GET` | `/` | TubeBuddy AI 프론트엔드 웹페이지 |
| `POST` | `/api/info` | 유튜브 메타데이터 (제목, 썸네일, 길이, 채널) 조회 |
| `POST` | `/api/process_video` | 오디오 다운로드 + Gemini 3.5 STT + 챕터 생성 (SSE) |
| `POST` | `/api/ask` | Gemini 3.8 Flash 영상 내용 검색 & 타임스탬프 Q&A |
