# To run this code you need to install the following dependencies:
# pip install google-genai

import base64
import os
from google import genai
from google.genai import types


def generate():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. 'export GEMINI_API_KEY=your_key'로 설정해주세요.")

    audio_file_path = os.path.join(os.path.dirname(__file__), "output_news.wav")
    if not os.path.exists(audio_file_path):
        raise FileNotFoundError(f"오디오 파일을 찾을 수 없습니다: {audio_file_path}")

    try:
        with open(audio_file_path, "rb") as f:
            audio_data = f.read()
    except OSError as e:
        raise IOError(f"오디오 파일을 읽는 중 오류가 발생했습니다: {e}") from e

    try:
        client = genai.Client(api_key=api_key)

        model = "gemini-3.5-transcribe"
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(
                        data=audio_data,
                        mime_type="audio/wav",
                    ),
                    types.Part.from_text(text="Generate a transcript of the speech."),
                ],
            ),
        ]
        generate_content_config = types.GenerateContentConfig(
            audio_transcription_config=types.AudioTranscriptionConfig(
                word_timestamp=True,
                diarization=True,
            ),
        )

        print("[정보] STT 변환 시작...\n")
        for chunk in client.models.generate_content_stream(
            model=model,
            contents=contents,
            config=generate_content_config,
        ):
            if text := chunk.text:
                print(text, end="")
        print("\n\n[정보] STT 변환 완료")

    except Exception as e:
        print(f"\n[오류] Gemini API 호출 중 문제가 발생했습니다: {e}")


if __name__ == "__main__":
    try:
        generate()
    except Exception as e:
        print(f"[실행 실패] {e}")


