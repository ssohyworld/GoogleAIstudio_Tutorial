document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide icons
  lucide.createIcons();

  let currentVideoData = null;
  let currentAudioFile = null;
  let fullTranscriptText = "";

  // DOM Elements
  const youtubeUrlInput = document.getElementById("youtubeUrl");
  const fetchBtn = document.getElementById("fetchBtn");
  const previewSection = document.getElementById("previewSection");
  const videoThumbnail = document.getElementById("videoThumbnail");
  const videoTitle = document.getElementById("videoTitle");
  const videoUploader = document.getElementById("videoUploader");
  const videoDuration = document.getElementById("videoDuration");

  const oneClickBtn = document.getElementById("oneClickBtn");
  const downloadAudioBtn = document.getElementById("downloadAudioBtn");
  const startTranscribeBtn = document.getElementById("startTranscribeBtn");

  const audioPlaceholder = document.getElementById("audioPlaceholder");
  const audioPlayerWrapper = document.getElementById("audioPlayerWrapper");
  const audioPlayer = document.getElementById("audioPlayer");
  const audioStatusBadge = document.getElementById("audioStatusBadge");
  const audioMetaInfo = document.getElementById("audioMetaInfo");
  const statusLog = document.getElementById("statusLog");

  const transcriptSection = document.getElementById("transcriptSection");
  const transcriptContent = document.getElementById("transcriptContent");
  const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");
  const copyBtnText = document.getElementById("copyBtnText");
  const downloadTxtBtn = document.getElementById("downloadTxtBtn");

  const optDiarization = document.getElementById("optDiarization");
  const optTimestamp = document.getElementById("optTimestamp");
  const languagePrompt = document.getElementById("languagePrompt");

  function setStatus(message, isError = false) {
    statusLog.textContent = message;
    if (isError) {
      statusLog.className = "text-rose-400 min-h-[48px] flex items-center";
    } else {
      statusLog.className = "text-slate-300 min-h-[48px] flex items-center";
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // 1. Fetch Video Info
  fetchBtn.addEventListener("click", async () => {
    const url = youtubeUrlInput.value.trim();
    if (!url) {
      alert("유튜브 URL을 입력해주세요.");
      return;
    }

    fetchBtn.disabled = true;
    fetchBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> <span>조회 중...</span>`;
    setStatus("영상 정보를 불러오는 중입니다...");

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "영상 정보를 가져오지 못했습니다.");
      }

      currentVideoData = data;
      currentAudioFile = null;

      // Update UI
      videoThumbnail.src = data.thumbnail || "";
      videoTitle.textContent = data.title;
      videoUploader.textContent = data.uploader;
      videoDuration.textContent = data.duration_string || `${data.duration}초`;

      previewSection.classList.remove("hidden");
      transcriptSection.classList.add("hidden");
      startTranscribeBtn.disabled = true;

      // Reset Audio Player to placeholder state
      audioPlaceholder.classList.remove("hidden");
      audioPlayerWrapper.classList.add("hidden");
      audioPlayer.removeAttribute("src");
      audioPlayer.load();

      audioStatusBadge.textContent = "다운로드 대기";
      audioStatusBadge.className = "text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700";
      audioMetaInfo.innerHTML = `<span>파일명: -</span><span>용량: -</span>`;

      setStatus("영상 조회가 완료되었습니다. '오디오 다운로드 & STT 한 번에 실행'을 눌러주세요.");
    } catch (err) {
      setStatus(`오류: ${err.message}`, true);
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.innerHTML = `<i data-lucide="search" class="w-4 h-4"></i><span>영상 조회</span>`;
      lucide.createIcons();
    }
  });

  // Core Download Audio Logic
  async function performAudioDownload() {
    const url = youtubeUrlInput.value.trim();
    if (!url) return null;

    downloadAudioBtn.disabled = true;
    oneClickBtn.disabled = true;
    downloadAudioBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full"></span> <span>다운로드 중...</span>`;
    setStatus("YouTube에서 고음질 오디오 스트림을 다운로드 및 MP3로 변환 중입니다...");
    audioStatusBadge.textContent = "다운로드 중...";
    audioStatusBadge.className = "text-[11px] px-2.5 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700/60 animate-pulse";

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "오디오 다운로드에 실패했습니다.");
      }

      currentAudioFile = data.filename;

      // Show audio player smoothly
      audioPlaceholder.classList.add("hidden");
      audioPlayerWrapper.classList.remove("hidden");
      audioPlayer.src = data.audio_url;
      audioPlayer.load();

      audioStatusBadge.textContent = "오디오 준비 완료";
      audioStatusBadge.className = "text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/60";

      audioMetaInfo.innerHTML = `
        <span>파일명: <b class="text-slate-300 font-mono">${data.filename}</b></span>
        <span>용량: <b class="text-slate-300">${formatBytes(data.file_size)}</b></span>
      `;

      startTranscribeBtn.disabled = false;
      setStatus("오디오 준비 완료! 플레이어로 재생하거나 Gemini STT를 실행하세요.");
      return currentAudioFile;
    } catch (err) {
      setStatus(`오디오 다운로드 오류: ${err.message}`, true);
      audioStatusBadge.textContent = "다운로드 실패";
      audioStatusBadge.className = "text-[11px] px-2.5 py-0.5 rounded-full bg-rose-900/60 text-rose-300 border border-rose-700/60";
      throw err;
    } finally {
      downloadAudioBtn.disabled = false;
      oneClickBtn.disabled = false;
      downloadAudioBtn.innerHTML = `<i data-lucide="download" class="w-4 h-4 text-slate-400"></i><span>1단계: 오디오만 다운로드</span>`;
      lucide.createIcons();
    }
  }

  // Step 1 Click
  downloadAudioBtn.addEventListener("click", async () => {
    try {
      await performAudioDownload();
    } catch (e) {
      console.error(e);
    }
  });

  // Core STT Transcription Logic
  async function performTranscription() {
    if (!currentAudioFile) {
      alert("먼저 오디오를 다운로드해주세요.");
      return;
    }

    startTranscribeBtn.disabled = true;
    oneClickBtn.disabled = true;
    startTranscribeBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> <span>Gemini 변환 중...</span>`;
    
    transcriptSection.classList.remove("hidden");
    transcriptContent.textContent = "Gemini 3.5 모델에 연결하여 트랜스크립트를 생성 중입니다...\n";
    fullTranscriptText = "";
    setStatus("Gemini 3.5 Transcribe 모델을 호출하여 음성을 인식 중입니다...");

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: currentAudioFile,
          diarization: optDiarization.checked,
          word_timestamp: optTimestamp.checked,
          language_prompt: languagePrompt.value.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "트랜스크립션 요청에 실패했습니다.");
      }

      transcriptContent.textContent = "";

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop(); // keep partial chunk

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              if (data.status === "progress") {
                setStatus(data.message);
              } else if (data.status === "text") {
                fullTranscriptText += data.chunk;
                transcriptContent.textContent = fullTranscriptText;
                transcriptContent.scrollTop = transcriptContent.scrollHeight;
              } else if (data.status === "done") {
                setStatus("🎉 트랜스크립션이 성공적으로 완료되었습니다!");
              } else if (data.status === "error") {
                setStatus(`Gemini 오류: ${data.message}`, true);
              }
            } catch (e) {
              console.error("SSE parse error", e);
            }
          }
        }
      }
    } catch (err) {
      setStatus(`트랜스크립션 처리 실패: ${err.message}`, true);
      transcriptContent.textContent += `\n[오류 발생] ${err.message}`;
    } finally {
      startTranscribeBtn.disabled = false;
      oneClickBtn.disabled = false;
      startTranscribeBtn.innerHTML = `<i data-lucide="mic" class="w-4 h-4"></i><span>2단계: Gemini STT 트랜스크립트 추출</span>`;
      lucide.createIcons();
    }
  }

  // Step 2 Click
  startTranscribeBtn.addEventListener("click", async () => {
    try {
      await performTranscription();
    } catch (e) {
      console.error(e);
    }
  });

  // One-Click Flow: Download Audio + Transcribe automatically
  oneClickBtn.addEventListener("click", async () => {
    try {
      if (!currentAudioFile) {
        await performAudioDownload();
      }
      await performTranscription();
    } catch (e) {
      console.error("One-click flow failed", e);
    }
  });

  // 4. Copy to Clipboard
  copyTranscriptBtn.addEventListener("click", () => {
    if (!fullTranscriptText) {
      alert("복사할 트랜스크립트 내용이 없습니다.");
      return;
    }
    navigator.clipboard.writeText(fullTranscriptText).then(() => {
      copyBtnText.textContent = "복사 완료!";
      setTimeout(() => {
        copyBtnText.textContent = "복사하기";
      }, 2000);
    });
  });

  // 5. Download as TXT
  downloadTxtBtn.addEventListener("click", () => {
    if (!fullTranscriptText) {
      alert("다운로드할 트랜스크립트 내용이 없습니다.");
      return;
    }
    const blob = new Blob([fullTranscriptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const videoTitleStr = currentVideoData?.title ? currentVideoData.title.replace(/[\/\\?%*:|"<>]/g, "_") : "transcript";
    a.href = url;
    a.download = `${videoTitleStr}_transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});
