# Gemini 3.5 STT (Speech-to-Text) 코드 라인별 해설

이 문서는 `gemini-35-stt-example.py` 파일의 모든 코드를 한 줄씩(Line-by-Line) 상세하게 설명합니다.

---

## 📄 전체 코드 구조 요약
1. **라이브러리 임포트 (Lines 1~7)**: Base64, OS 및 Google GenAI SDK 모듈 임포트
2. **`generate` 함수 (Lines 10~60)**:
   - 환경 변수 및 오디오 파일 존재 검증 (Lines 11~17)
   - 오디오 파일 로드 및 파일 I/O 예외 처리 (Lines 19~23)
   - 클라이언트 초기화 및 오디오 파트/프롬프트 구성 (Lines 26~40)
   - 화자 분리(Diarization) 및 타임스탬프 설정 (Lines 41~46)
   - 실시간 스트리밍 음성 인식(STT) 수행 및 예외 처리 (Lines 48~60)
3. **메인 실행 블록 (Lines 63~67)**: 스크립트 실행 진입점 및 전역 에러 핸들링

---

## 🔍 라인별 상세 설명

### 1. 주석 및 라이브러리 임포트
```python
1: # To run this code you need to install the following dependencies:
2: # pip install google-genai
```
- **Line 1~2**: 필요한 의존성 패키지(`google-genai`)를 설치하도록 안내하는 주석입니다.

```python
4: import base64
5: import os
6: from google import genai
7: from google.genai import types
```
- **Line 4 (`import base64`)**: 오디오 데이터 인코딩/디코딩에 사용할 수 있는 Base64 모듈입니다.
- **Line 5 (`import os`)**: 파일 경로 조합(`os.path.join`), 파일 존재 여부 확인(`os.path.exists`), 환경 변수(`GEMINI_API_KEY`) 조회를 위한 운영체제 인터페이스 모듈입니다.
- **Line 6~7 (`from google import genai`, `from google.genai import types`)**: 최신 Google GenAI SDK 클라이언트와 설정 및 데이터 타입 객체(`types`)를 임포트합니다.

---

### 2. 음성 인식 생성 함수 (`generate`)

#### 환경 변수 및 입력 파일 검증
```python
10: def generate():
11:     api_key = os.environ.get("GEMINI_API_KEY")
12:     if not api_key:
13:         raise ValueError("GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. 'export GEMINI_API_KEY=your_key'로 설정해주세요.")
```
- **Line 10**: STT 변환을 수행하는 메인 함수 `generate()`를 정의합니다.
- **Line 11**: 시스템 환경 변수에서 `GEMINI_API_KEY` 값을 읽어옵니다.
- **Line 12~13**: API 키가 없을 경우 `ValueError` 예외를 발생시켜 사용자에게 키 설정을 안내합니다.

```python
15:     audio_file_path = os.path.join(os.path.dirname(__file__), "output_news.wav")
16:     if not os.path.exists(audio_file_path):
17:         raise FileNotFoundError(f"오디오 파일을 찾을 수 없습니다: {audio_file_path}")
```
- **Line 15**: 현재 실행 중인 스크립트 파일과 동일한 디렉터리 내의 `output_news.wav` 파일 경로를 안전하게 조합합니다.
- **Line 16~17**: 지정된 경로에 오디오 파일이 실제로 존재하는지 확인하고, 파일이 없으면 `FileNotFoundError` 예외를 발생시킵니다.

#### 파일 바이너리 읽기 및 안전 처리
```python
19:     try:
20:         with open(audio_file_path, "rb") as f:
21:             audio_data = f.read()
22:     except OSError as e:
23:         raise IOError(f"오디오 파일을 읽는 중 오류가 발생했습니다: {e}") from e
```
- **Line 19~21**: `with open(..., "rb")` 문을 사용해 오디오 파일을 바이너리 읽기 모드로 열고 파일 전체를 `audio_data` 바이트 변수에 담습니다.
- **Line 22~23**: 권한 부족이나 디스크 읽기 오류 등 OS 레벨의 파일 읽기 에러(`OSError`)가 발생했을 때 `IOError`로 감싸서 명확히 안내합니다.

#### 클라이언트 생성 및 요청 구성
```python
25:     try:
26:         client = genai.Client(api_key=api_key)
27: 
28:         model = "gemini-3.5-transcribe"
29:         contents = [
30:             types.Content(
31:                 role="user",
32:                 parts=[
33:                     types.Part.from_bytes(
34:                         data=audio_data,
35:                         mime_type="audio/wav",
36:                     ),
37:                     types.Part.from_text(text="Generate a transcript of the speech."),
38:                 ],
39:             ),
40:         ]
```
- **Line 25**: API 호출 중 네트워크 오류나 권한 에러 등을 포괄적으로 처리하기 위한 `try` 블록을 시작합니다.
- **Line 26**: 추출한 API 키를 사용하여 `genai.Client` 객체를 생성합니다.
- **Line 28**: 음성 인식(STT) 전용 모델인 `gemini-3.5-transcribe`를 지정합니다.
- **Line 29~40**: 모델 입력값(`contents`) 구성:
  - `types.Part.from_bytes`: 로컬에서 읽은 WAV 바이너리 데이터(`data=audio_data`)와 MIME 타입(`audio/wav`)을 멀티모달 파트로 전달합니다.
  - `types.Part.from_text`: 음성을 텍스트로 변환해 달라는 프롬프트 지시어를 함께 전달합니다.

#### STT 세부 옵션 설정 (타임스탬프 & 화자 분리)
```python
41:         generate_content_config = types.GenerateContentConfig(
42:             audio_transcription_config=types.AudioTranscriptionConfig(
43:                 word_timestamp=True,
44:                 diarization=True,
45:             ),
46:         )
```
- **Line 41~46**: `AudioTranscriptionConfig`를 통한 고급 STT 설정:
  - `word_timestamp=True`: 각 단어별 발화 시작/종료 시간(Timestamp) 정보를 포함하여 변환합니다.
  - `diarization=True`: 화자 분리(Diarization)를 활성화하여 누가 말했는지(예: Speaker A, Speaker B)를 구분합니다.

#### 실시간 스트리밍 출력 및 예외 처리
```python
48:         print("[정보] STT 변환 시작...\n")
49:         for chunk in client.models.generate_content_stream(
50:             model=model,
51:             contents=contents,
52:             config=generate_content_config,
53:         ):
54:             if text := chunk.text:
55:                 print(text, end="")
56:         print("\n\n[정보] STT 변환 완료")
57: 
58:     except Exception as e:
59:         print(f"\n[오류] Gemini API 호출 중 문제가 발생했습니다: {e}")
```
- **Line 48**: 사용자에게 STT 변환 작업이 시작되었음을 콘솔에 알립니다.
- **Line 49~53**: `generate_content_stream` API를 호출해 변환 결과가 생성되는 즉시 실시간 청크 단위로 스트리밍 수신합니다.
- **Line 54~55**: 수신된 청크에 텍스트가 있으면 줄바꿈 없이 순차적으로 화면에 출력하여 타이핑 효과를 냅니다.
- **Line 56**: 모든 스트림 수신이 끝나면 완료 메시지를 출력합니다.
- **Line 58~59**: API 호출 중 오류(네트워크 끊김, 할당량 초과, 인증 실패 등)가 발생하면 에러 내용을 출력합니다.

---

### 3. 실행 진입점 (`__main__`)
```python
62: if __name__ == "__main__":
63:     try:
64:         generate()
65:     except Exception as e:
66:         print(f"[실행 실패] {e}")
```
- **Line 62**: 해당 스크립트가 직접 실행될 때만 실행되도록 진입점을 구성합니다.
- **Line 63~66**: `generate()` 함수를 실행하고, 처리되지 않은 예외가 있을 경우 깔끔한 에러 메시지를 출력하며 프로그램을 안전하게 종료합니다.
