document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  let currentVideoData = null;
  let currentAudioFile = null;
  let fullTranscriptText = "";
  let isSeeking = false;

  // DOM Elements
  const youtubeUrl = document.getElementById("youtubeUrl");
  const fetchBtn = document.getElementById("fetchBtn");
  const oneClickBtn = document.getElementById("oneClickBtn");

  const playerBackdrop = document.getElementById("playerBackdrop");
  const cinemaTitle = document.getElementById("cinemaTitle");
  const cinemaSubtitle = document.getElementById("cinemaSubtitle");
  const audioElement = document.getElementById("audioElement");

  const playPauseBtn = document.getElementById("playPauseBtn");
  const playIcon = document.getElementById("playIcon");
  const timeBadge = document.getElementById("timeBadge");
  const seekBar = document.getElementById("seekBar");
  const totalDurationLabel = document.getElementById("totalDurationLabel");
  const muteBtn = document.getElementById("muteBtn");
  const shareBtn = document.getElementById("shareBtn");
  const likeBtn = document.getElementById("likeBtn");

  const statusMessage = document.getElementById("statusMessage");
  const transcriptContent = document.getElementById("transcriptContent");
  const copyBtn = document.getElementById("copyBtn");
  const copyBtnLabel = document.getElementById("copyBtnLabel");
  const downloadTxtBtn = document.getElementById("downloadTxtBtn");

  const optDiarization = document.getElementById("optDiarization");
  const optTimestamp = document.getElementById("optTimestamp");

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function setStatus(msg, isError = false) {
    statusMessage.textContent = msg;
    statusMessage.className = isError
      ? "flex-1 font-mono text-rose-400 text-[11px] truncate text-right font-semibold"
      : "flex-1 font-mono text-cyan-400 text-[11px] truncate text-right";
  }

  // 1. Fetch Video Metadata
  async function fetchVideoInfo() {
    const url = youtubeUrl.value.trim();
    if (!url) return alert("유튜브 URL을 입력해주세요.");

    fetchBtn.disabled = true;
    fetchBtn.innerHTML = `<span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span><span>로드 중...</span>`;
    setStatus("영상 정보를 불러오는 중입니다...");

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "영상 정보 조회 실패");

      currentVideoData = data;

      // Update Cinematic Player
      if (data.thumbnail) {
        playerBackdrop.style.backgroundImage = `url('${data.thumbnail}')`;
      }
      cinemaTitle.textContent = data.title || "YOUTUBE VIDEO";
      cinemaSubtitle.textContent = `${data.uploader || "CHANNEL"} • ${data.duration_string || formatTime(data.duration)}`;
      totalDurationLabel.textContent = data.duration_string || formatTime(data.duration);

      setStatus("영상 로드 완료! [오디오 다운로드 & STT 변환]을 눌러주세요.");
    } catch (err) {
      setStatus(`오류: ${err.message}`, true);
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.innerHTML = `<i data-lucide="search" class="w-3.5 h-3.5"></i><span>영상 로드</span>`;
      lucide.createIcons();
    }
  }

  fetchBtn.addEventListener("click", fetchVideoInfo);

  // 2. Audio Player Controls
  playPauseBtn.addEventListener("click", () => {
    if (!audioElement.src || audioElement.src === window.location.href) {
      if (currentAudioFile) {
        audioElement.src = `/downloads/${currentAudioFile}`;
      } else {
        return alert("먼저 오디오를 다운로드해주세요.");
      }
    }

    if (audioElement.paused) {
      audioElement.play();
    } else {
      audioElement.pause();
    }
  });

  audioElement.addEventListener("play", () => {
    playPauseBtn.innerHTML = `<i data-lucide="pause" class="w-4 h-4 fill-white"></i>`;
    lucide.createIcons();
  });

  audioElement.addEventListener("pause", () => {
    playPauseBtn.innerHTML = `<i data-lucide="play" class="w-4 h-4 fill-white"></i>`;
    lucide.createIcons();
  });

  audioElement.addEventListener("timeupdate", () => {
    if (!isSeeking && audioElement.duration) {
      const current = audioElement.currentTime;
      const duration = audioElement.duration;
      timeBadge.textContent = formatTime(current);
      seekBar.value = (current / duration) * 100;
    }
  });

  audioElement.addEventListener("loadedmetadata", () => {
    totalDurationLabel.textContent = formatTime(audioElement.duration);
  });

  seekBar.addEventListener("input", () => {
    isSeeking = true;
    if (audioElement.duration) {
      const seekTo = (seekBar.value / 100) * audioElement.duration;
      timeBadge.textContent = formatTime(seekTo);
    }
  });

  seekBar.addEventListener("change", () => {
    if (audioElement.duration) {
      audioElement.currentTime = (seekBar.value / 100) * audioElement.duration;
    }
    isSeeking = false;
  });

  muteBtn.addEventListener("click", () => {
    audioElement.muted = !audioElement.muted;
    muteBtn.innerHTML = audioElement.muted
      ? `<i data-lucide="volume-x" class="w-4 h-4 text-rose-400"></i>`
      : `<i data-lucide="volume-2" class="w-4 h-4"></i>`;
    lucide.createIcons();
  });

  shareBtn.addEventListener("click", () => {
    const url = youtubeUrl.value.trim();
    if (url) {
      navigator.clipboard.writeText(url);
      alert("영상 URL이 클립보드에 복사되었습니다!");
    }
  });

  likeBtn.addEventListener("click", () => {
    likeBtn.classList.toggle("text-rose-500");
    likeBtn.classList.toggle("bg-rose-950/40");
  });

  // 3. Audio Download & STT Workflow
  async function downloadAudio() {
    const url = youtubeUrl.value.trim();
    if (!url) throw new Error("유튜브 URL을 입력해주세요.");

    setStatus("유튜브에서 고음질 오디오 다운로드 및 MP3 인코딩 중...");
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "오디오 다운로드 실패");

    currentAudioFile = data.filename;
    audioElement.src = data.audio_url;
    audioElement.load();

    if (data.title && !currentVideoData) {
      cinemaTitle.textContent = data.title;
    }

    return currentAudioFile;
  }

  async function startTranscription() {
    if (!currentAudioFile) throw new Error("오디오 파일이 없습니다.");

    setStatus("Gemini 3.5 Transcribe 모델을 호출하여 실시간 전사 중...");
    transcriptContent.textContent = "Gemini 3.5 모델에 연결하여 트랜스크립트를 생성 중입니다...\n";
    fullTranscriptText = "";

    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: currentAudioFile,
        diarization: optDiarization.checked,
        word_timestamp: optTimestamp.checked,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "트랜스크립션 요청 실패");
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
      buffer = lines.pop();

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
              setStatus("🎉 Gemini 3.5 STT 전사가 완료되었습니다!");
            } else if (data.status === "error") {
              setStatus(`오류: ${data.message}`, true);
            }
          } catch (e) {}
        }
      }
    }
  }

  oneClickBtn.addEventListener("click", async () => {
    oneClickBtn.disabled = true;
    oneClickBtn.innerHTML = `<span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span><span>처리 중...</span>`;

    try {
      if (!currentVideoData) {
        await fetchVideoInfo();
      }
      await downloadAudio();
      await startTranscription();
    } catch (err) {
      setStatus(`실행 오류: ${err.message}`, true);
      transcriptContent.textContent += `\n[오류] ${err.message}`;
    } finally {
      oneClickBtn.disabled = false;
      oneClickBtn.innerHTML = `<i data-lucide="zap" class="w-3.5 h-3.5 text-amber-300"></i><span>오디오 다운로드 & STT 변환</span>`;
      lucide.createIcons();
    }
  });

  // 4. Copy & Download Text
  copyBtn.addEventListener("click", () => {
    if (!fullTranscriptText) return alert("복사할 텍스트가 없습니다.");
    navigator.clipboard.writeText(fullTranscriptText).then(() => {
      copyBtnLabel.textContent = "복사 완료!";
      setTimeout(() => (copyBtnLabel.textContent = "복사하기"), 2000);
    });
  });

  downloadTxtBtn.addEventListener("click", () => {
    if (!fullTranscriptText) return alert("다운로드할 텍스트가 없습니다.");
    const blob = new Blob([fullTranscriptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const title = currentVideoData?.title ? currentVideoData.title.replace(/[\/\\?%*:|"<>]/g, "_") : "transcript";
    a.href = url;
    a.download = `${title}_transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Carousel Dot interaction
  document.querySelectorAll(".carousel-dot").forEach((dot) => {
    dot.addEventListener("click", (e) => {
      document.querySelectorAll(".carousel-dot").forEach((d) => {
        d.className = "carousel-dot w-2 h-2 rounded-full bg-slate-700 hover:bg-indigo-400 transition-all cursor-pointer";
      });
      e.target.className = "carousel-dot w-5 h-2 rounded-full bg-indigo-500 cursor-pointer";
    });
  });

  // Automatically load initial demo video metadata on startup
  fetchVideoInfo();
});
