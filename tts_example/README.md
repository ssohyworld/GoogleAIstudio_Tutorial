# Gemini 3.1 TTS (Text-to-Speech) 코드 라인별 해설

이 문서는 `gemini-31-tts-example.py` 파일의 모든 코드를 한 줄씩(Line-by-Line) 상세하게 설명합니다.

---

## 📄 전체 코드 구조 요약
1. **라이브러리 임포트 (Lines 1~10)**: Google GenAI SDK 및 오디오 처리를 위한 표준 라이브러리 로드
2. **`save_binary_file` 함수 (Lines 13~17)**: 생성된 오디오 바이너리 데이터를 로컬 파일로 저장
3. **`generate` 함수 (Lines 20~88)**: Gemini 3.1 TTS 모델 호출, 음성 합성 및 스트리밍 응답 처리
4. **`convert_to_wav` 함수 (Lines 89~128)**: PCM 원시 오디오 데이터에 표준 WAV 헤더를 붙여 재생 가능한 WAV 포맷으로 변환
5. **`parse_audio_mime_type` 함수 (Lines 129~162)**: MIME 타입 문자열에서 샘플 레이트와 비트 심도를 파싱
6. **메인 실행 블록 (Lines 164~166)**: 스크립트 실행 진입점

---

## 🔍 라인별 상세 설명

### 1. 주석 및 라이브러리 임포트
```python
1: # To run this code you need to install the following dependencies:
2: # pip install google-genai
3: # 변경사항이 발생했습니다.
```
- **Line 1~3**: 실행에 필요한 의존성 패키지(`google-genai`) 설치 안내 주석입니다.

```python
5: import mimetypes
6: import os
7: import re
8: import struct
9: from google import genai
10: from google.genai import types
```
- **Line 5 (`import mimetypes`)**: MIME 타입을 통해 적절한 파일 확장자(예: `.wav`, `.mp3`)를 추론하기 위한 내장 모듈입니다.
- **Line 6 (`import os`)**: 환경 변수(`GEMINI_API_KEY`) 조회 등을 위한 운영체제 인터페이스 모듈입니다.
- **Line 7 (`import re`)**: 정규 표현식 모듈입니다.
- **Line 8 (`import struct`)**: 파이썬의 원시 바이트 데이터를 C 구조체 형태의 바이너리 데이터(WAV 헤더 생성 시 사용)로 패킹하기 위한 모듈입니다.
- **Line 9~10 (`from google import genai`, `from google.genai import types`)**: 구글의 최신 Gemini Python SDK 클라이언트와 타입 정의 객체들을 불러옵니다.

---

### 2. 파일 저장 함수 (`save_binary_file`)
```python
13: def save_binary_file(file_name, data):
14:     f = open(file_name, "wb")
15:     f.write(data)
16:     f.close()
17:     print(f"File saved to to: {file_name}")
```
- **Line 13**: 파일명(`file_name`)과 바이너리 데이터(`data`)를 인자로 받아 파일로 저장하는 함수를 정의합니다.
- **Line 14**: 전달받은 파일명을 바이너리 쓰기 모드(`"wb"`)로 엽니다.
- **Line 15**: 오디오 바이너리 데이터를 파일에 기록합니다.
- **Line 16**: 파일 핸들을 닫아 리소스를 해제하고 저장을 완료합니다.
- **Line 17**: 저장이 완료된 파일 경로를 콘솔에 출력합니다.

---

### 3. 음성 합성 생성 함수 (`generate`)

#### 클라이언트 초기화 및 모델/프롬프트 설정
```python
20: def generate():
21:     client = genai.Client(
22:         api_key=os.environ.get("GEMINI_API_KEY"),
23:     )
```
- **Line 20**: 음성 생성을 총괄하는 메인 함수 `generate()`를 정의합니다.
- **Line 21~23**: 시스템 환경 변수에 등록된 `GEMINI_API_KEY`를 가져와 Google GenAI 클라이언트 인스턴스를 초기화합니다.

```python
25:     model = "gemini-3.1-flash-tts-preview"
26:     contents = [
27:         types.Content(
28:             role="user",
29:             parts=[
30:                 types.Part.from_text(text="""Read the following transcript based on the audio profile and director's note.
...
47: [enthusiastic] 압도적인 추론 능력에 상상을 초월하는 초저가 정책까지 더해진 제미나이 4.0 프로! 이제 AI 시장의 판도가 완전히 뒤바뀔 것으로 보입니다."""),
31:             ],
32:         ),
33:     ]
```
- **Line 25**: 구글의 음성 전용 모델인 `gemini-3.1-flash-tts-preview`를 모델명으로 지정합니다.
- **Line 26~50**: 모델에 전달할 대본과 지시사항(Director's note, Audio Profile, 대사 및 감정 태그 `[excited]`, `[confident]` 등)을 담은 `Content` 객체 배열을 생성합니다.

#### 오디오 출력 설정 (Config)
```python
51:     generate_content_config = types.GenerateContentConfig(
52:         temperature=1,
53:         response_modalities=[
54:             "audio",
55:         ],
56:         speech_config=types.SpeechConfig(
57:             voice_config=types.VoiceConfig(
58:                 prebuilt_voice_config=types.PrebuiltVoiceConfig(
59:                     voice_name="Kore"
60:                 )
61:             )
62:         ),
63:     )
```
- **Line 51~52**: 모델 파라미터를 설정합니다. `temperature=1`로 다양하고 자연스러운 표현을 유도합니다.
- **Line 53~55**: 응답 모달리티(`response_modalities`)를 `["audio"]`로 지정하여 텍스트 대신 오디오를 반환받도록 요청합니다.
- **Line 56~62**: 음성 설정(`SpeechConfig`)에서 사전 정의된 목소리(Prebuilt Voice) 중 `"Kore"` 음색을 선택합니다.

#### 스트리밍 응답 수신 및 파일 변환/저장
```python
65:     file_index = 0
66:     for chunk in client.models.generate_content_stream(
67:         model=model,
68:         contents=contents,
69:         config=generate_content_config,
70:     ):
```
- **Line 65**: 생성되는 오디오 조각(청크) 파일의 인덱스 번호를 0으로 초기화합니다.
- **Line 66~70**: `generate_content_stream` API를 호출하여 실시간 스트리밍 형태로 모델의 응답 조각(`chunk`)들을 순차적으로 받아옵니다.

```python
71:         if (
72:             chunk.parts is None
73:         ):
74:             continue
75:         if chunk.parts[0].inline_data and chunk.parts[0].inline_data.data:
76:             file_name = f"ENTER_FILE_NAME_{file_index}"
77:             file_index += 1
78:             inline_data = chunk.parts[0].inline_data
79:             data_buffer = inline_data.data
80:             file_extension = mimetypes.guess_extension(inline_data.mime_type)
81:             if file_extension is None:
82:                 file_extension = ".wav"
83:                 data_buffer = convert_to_wav(inline_data.data, inline_data.mime_type)
84:             save_binary_file(f"{file_name}{file_extension}", data_buffer)
85:         else:
86:             if text := chunk.text:
87:                 print(text)
```
- **Line 71~74**: 청크에 데이터 파트가 없으면 다음 청크로 건너뜁니다.
- **Line 75**: 파트 내에 인라인 오디오 바이너리(`inline_data`)가 포함되어 있는지 검사합니다.
- **Line 76~77**: 파일명(`ENTER_FILE_NAME_0`, `ENTER_FILE_NAME_1`...)을 부여하고 인덱스를 1 증가시킵니다.
- **Line 78~79**: 수신된 인라인 데이터 객체와 실제 바이트 데이터를 추출합니다.
- **Line 80**: 수신된 MIME 타입(예: `audio/L16`)으로부터 파일 확장자를 추측합니다.
- **Line 81~83**: 확장자가 명확하지 않은 원시 PCM 데이터일 경우 `.wav` 확장자를 부여하고 `convert_to_wav` 함수를 호출해 WAV 헤더를 덧붙여줍니다.
- **Line 84**: 완성된 오디오 바이트 데이터를 파일로 저장합니다.
- **Line 85~87**: 만약 오디오가 아닌 텍스트 응답이 올 경우 콘솔에 텍스트를 출력합니다.

---

### 4. WAV 헤더 생성 함수 (`convert_to_wav`)
```python
89: def convert_to_wav(audio_data: bytes, mime_type: str) -> bytes:
99:     parameters = parse_audio_mime_type(mime_type)
100:     bits_per_sample = parameters["bits_per_sample"]
101:     sample_rate = parameters["rate"]
102:     num_channels = 1
103:     data_size = len(audio_data)
104:     bytes_per_sample = bits_per_sample // 8
105:     block_align = num_channels * bytes_per_sample
106:     byte_rate = sample_rate * block_align
107:     chunk_size = 36 + data_size
```
- **Line 89**: 원시 오디오 바이트(`audio_data`)와 MIME 타입을 받아 표준 WAV 바이너리를 반환하는 함수를 정의합니다.
- **Line 99~101**: MIME 타입에서 비트 심도(Bits per sample)와 샘플 레이트(Sample rate)를 추출합니다.
- **Line 102~107**: WAV 헤더 스펙 계산:
  - `num_channels = 1` (모노 채널)
  - `data_size`: 실제 오디오 데이터의 바이트 크기
  - `block_align`: 한 샘플당 전체 채널 바이트 크기
  - `byte_rate`: 초당 전송 바이트 수 (`sample_rate * block_align`)
  - `chunk_size`: 전체 파일 크기에서 8바이트를 뺀 크기 (`36 + data_size`)

```python
111:     header = struct.pack(
112:         "<4sI4s4sIHHIIHH4sI",
113:         b"RIFF",          # ChunkID
114:         chunk_size,       # ChunkSize (total file size - 8 bytes)
115:         b"WAVE",          # Format
116:         b"fmt ",          # Subchunk1ID
117:         16,               # Subchunk1Size (16 for PCM)
118:         1,                # AudioFormat (1 for PCM)
119:         num_channels,     # NumChannels
120:         sample_rate,      # SampleRate
121:         byte_rate,        # ByteRate
122:         block_align,      # BlockAlign
123:         bits_per_sample,  # BitsPerSample
124:         b"data",          # Subchunk2ID
125:         data_size         # Subchunk2Size (size of audio data)
126:     )
127:     return header + audio_data
```
- **Line 111~126**: `struct.pack`을 사용하여 리틀 엔디안(`<`) 형식으로 44바이트 표준 RIFF/WAVE 헤더 구조체를 생성합니다.
- **Line 127**: 완성된 44바이트 헤더 뒤에 원시 오디오 데이터를 결합하여 최종 WAV 바이트 스트림을 반환합니다.

---

### 5. MIME 타입 파서 (`parse_audio_mime_type`)
```python
129: def parse_audio_mime_type(mime_type: str) -> dict[str, int | None]:
141:     bits_per_sample = 16
142:     rate = 24000
145:     parts = mime_type.split(";")
146:     for param in parts:
147:         param = param.strip()
148:         if param.lower().startswith("rate="):
149:             try:
150:                 rate_str = param.split("=", 1)[1]
151:                 rate = int(rate_str)
152:             except (ValueError, IndexError):
154:                 pass
155:         elif param.startswith("audio/L"):
156:             try:
157:                 bits_per_sample = int(param.split("L", 1)[1])
158:             except (ValueError, IndexError):
159:                 pass
161:     return {"bits_per_sample": bits_per_sample, "rate": rate}
```
- **Line 129~142**: MIME 문자열(예: `audio/L16;rate=24000`)을 파싱하기 위한 기본값(16비트, 24000Hz)을 설정합니다.
- **Line 145~160**: 세미콜론(`;`) 단위로 분리하여 `rate=` 값과 `audio/L` 뒤의 비트 수(16 등)를 정수로 변환하여 추출합니다.
- **Line 161**: 추출된 파라미터 딕셔너리를 반환합니다.

---

### 6. 실행 진입점 (`__main__`)
```python
164: if __name__ == "__main__":
165:     generate()
```
- **Line 164~165**: 해당 파이썬 스크립트가 직접 실행될 때 `generate()` 함수를 호출하여 전체 과정을 시작합니다.
