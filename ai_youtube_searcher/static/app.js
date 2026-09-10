let ytPlayer = null;
let currentVideoId = "QgaTjRH5sqk";
let currentTranscript = "";
let currentChapters = [];
let currentTargetSeconds = 0;
let isMuted = false;
let currentVolume = 80;

// Helper to post message directly to iframe as fallback
function postToIframe(func, args = []) {
  const iframe = document.getElementById("ytIframe");
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: func, args: args }),
      "*"
    );
  }
}

// 1. YouTube IFrame API Ready Callback
function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player("ytIframe", {
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
}

function onPlayerReady(event) {
  try {
    event.target.setVolume(currentVolume);
  } catch (e) {}
  setInterval(updatePlayerTime, 500);
}

function onPlayerStateChange(event) {
  const ytPlayIcon = document.getElementById("ytPlayIcon");
  if (!ytPlayIcon) return;

  if (event.data === YT.PlayerState.PLAYING) {
    ytPlayIcon.setAttribute("data-lucide", "pause");
    lucide.createIcons();
  } else {
    ytPlayIcon.setAttribute("data-lucide", "play");
    lucide.createIcons();
  }
}

function formatSeconds(sec) {
  if (isNaN(sec) || sec === 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseTimestampToSeconds(tsStr) {
  if (!tsStr) return 0;
  const clean = tsStr.replace(/[\[\]]/g, "").trim();
  const parts = clean.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function updatePlayerTime() {
  if (ytPlayer && ytPlayer.getCurrentTime) {
    try {
      const current = ytPlayer.getCurrentTime();
      const videoCurrentTime = document.getElementById("videoCurrentTime");
      if (videoCurrentTime && current !== undefined) {
        videoCurrentTime.textContent = formatSeconds(current);
      }
      const dur = ytPlayer.getDuration();
      const videoTotalDuration = document.getElementById("videoTotalDuration");
      if (videoTotalDuration && dur > 0) {
        videoTotalDuration.textContent = formatSeconds(dur);
      }
    } catch (e) {}
  }
}

function seekAndPlay(seconds) {
  if (ytPlayer && ytPlayer.seekTo) {
    try {
      ytPlayer.seekTo(seconds, true);
      ytPlayer.playVideo();
    } catch (e) {}
  }
  postToIframe("seekTo", [seconds, true]);
  postToIframe("playVideo", []);
}
window.seekAndPlayGlobal = (sec) => seekAndPlay(sec);

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  // DOM Elements
  const youtubeUrlInput = document.getElementById("youtubeUrlInput");
  const searchVideoBtn = document.getElementById("searchVideoBtn");
  const ytIframe = document.getElementById("ytIframe");

  const displayVideoTitle = document.getElementById("displayVideoTitle");
  const displayVideoChannel = document.getElementById("displayVideoChannel");
  const videoTotalDuration = document.getElementById("videoTotalDuration");
  const sttBadge = document.getElementById("sttBadge");
  const videoLoadingOverlay = document.getElementById("videoLoadingOverlay");
  const loadingStatusText = document.getElementById("loadingStatusText");

  const ytPlayPauseBtn = document.getElementById("ytPlayPauseBtn");
  const ytPlayIcon = document.getElementById("ytPlayIcon");
  const volumeSlider = document.getElementById("volumeSlider");
  const volumeLevelText = document.getElementById("volumeLevelText");
  const volumeMuteBtn = document.getElementById("volumeMuteBtn");
  const volumeIcon = document.getElementById("volumeIcon");

  const chaptersContainer = document.getElementById("chaptersContainer");

  const aiQuestionInput = document.getElementById("aiQuestionInput");
  const askAiBtn = document.getElementById("askAiBtn");
  const aiAnswerText = document.getElementById("aiAnswerText");
  const aiModelName = document.getElementById("aiModelName");
  const jumpNowBtn = document.getElementById("jumpNowBtn");
  const jumpButtonText = document.getElementById("jumpButtonText");

  const viewTranscriptBtn = document.getElementById("viewTranscriptBtn");
  const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");
  const transcriptModal = document.getElementById("transcriptModal");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const modalTranscriptContent = document.getElementById("modalTranscriptContent");

  // Play / Pause & Volume controls are now handled natively inside the YouTube player
  if (ytPlayPauseBtn) {
    ytPlayPauseBtn.addEventListener("click", () => {
      let isPlaying = false;
      if (ytPlayer && ytPlayer.getPlayerState) {
        try {
          isPlaying = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
        } catch (e) {}
      }
      if (isPlaying) {
        if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
        postToIframe("pauseVideo", []);
      } else {
        if (ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo();
        postToIframe("playVideo", []);
      }
    });
  }

  // Search Video & Full STT Pipeline
  async function handleSearch() {
    const url = youtubeUrlInput.value.trim();
    if (!url) return alert("유튜브 URL을 입력해주세요.");

    searchVideoBtn.disabled = true;
    searchVideoBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-stone-900 border-t-transparent rounded-full"></span><span>분석 중...</span>`;
    videoLoadingOverlay.classList.remove("hidden");
    loadingStatusText.textContent = "영상 메타데이터 조회 중...";

    try {
      // 1. Fetch metadata
      const infoRes = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const info = await infoRes.json();
      if (!infoRes.ok) throw new Error(info.detail || "영상 조회 실패");

      currentVideoId = info.id;
      displayVideoTitle.textContent = info.title;
      displayVideoChannel.textContent = `${info.uploader} • ${info.duration_string || formatSeconds(info.duration)}`;
      if (videoTotalDuration) {
        videoTotalDuration.textContent = info.duration_string || formatSeconds(info.duration);
      }

      // Update iframe source & load in player
      if (ytIframe) {
        ytIframe.src = `https://www.youtube-nocookie.com/embed/${info.id}?enablejsapi=1&playsinline=1&rel=0&autoplay=1`;
      }
      if (ytPlayer && ytPlayer.loadVideoById) {
        try {
          ytPlayer.loadVideoById(info.id);
        } catch (e) {}
      }

      // 2. Process Audio + Gemini 3.5 STT (SSE Stream)
      loadingStatusText.textContent = "오디오 스트림 다운로드 및 Gemini 3.5 STT 전사 중...";
      sttBadge.textContent = "STT 전사 중...";
      sttBadge.className = "text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800";

      const processRes = await fetch("/api/process_video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!processRes.ok) {
        const err = await processRes.json();
        throw new Error(err.detail || "STT 처리 실패");
      }

      const reader = processRes.body.getReader();
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
                loadingStatusText.textContent = data.message;
              } else if (data.status === "done") {
                currentTranscript = data.transcript;
                currentChapters = data.chapters || [];
                renderChapters(currentChapters);

                sttBadge.textContent = "Gemini 3.5 STT 완료 ✓";
                sttBadge.className = "text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800";
                videoLoadingOverlay.classList.add("hidden");
              } else if (data.status === "error") {
                throw new Error(data.message);
              }
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      alert(`오류: ${err.message}`);
      sttBadge.textContent = "오류 발생";
      sttBadge.className = "text-xs font-bold px-3 py-1 rounded-full bg-rose-100 text-rose-800";
      videoLoadingOverlay.classList.add("hidden");
    } finally {
      searchVideoBtn.disabled = false;
      searchVideoBtn.innerHTML = `<span>영상 로드 & AI 분석</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      lucide.createIcons();
    }
  }

  searchVideoBtn.addEventListener("click", handleSearch);
  youtubeUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });

  // Render Chapters Grid
  function renderChapters(chapters) {
    if (!chapters || chapters.length === 0) return;
    chaptersContainer.innerHTML = "";

    chapters.forEach((ch) => {
      const sec = ch.timestamp_seconds ?? parseTimestampToSeconds(ch.timestamp_str);
      const card = document.createElement("div");
      card.className = "chapter-item bg-white p-3.5 rounded-xl border border-stone-200 flex items-center justify-between cursor-pointer hover:bg-stone-50";
      card.innerHTML = `
        <div class="overflow-hidden pr-2">
          <p class="text-xs font-bold text-stone-900 truncate">${ch.title}</p>
          <p class="text-[11px] text-stone-500 truncate">${ch.summary || ch.category || ""}</p>
        </div>
        <span class="ts-badge shrink-0">▶ ${ch.timestamp_str}</span>
      `;

      card.addEventListener("click", () => {
        seekAndPlay(sec);
      });

      chaptersContainer.appendChild(card);
    });

    lucide.createIcons();
  }

  // Default Chapter items click listener
  document.querySelectorAll(".chapter-item").forEach((card) => {
    card.addEventListener("click", () => {
      const sec = parseInt(card.dataset.seconds || "0", 10);
      seekAndPlay(sec);
    });
  });

  // Ask AI (Gemini 3.8 Flash) & Auto Jump
  async function handleAskAi(questionText) {
    const question = questionText || aiQuestionInput.value.trim();
    if (!question) return alert("질문을 입력해주세요.");

    askAiBtn.disabled = true;
    askAiBtn.innerHTML = `<span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-stone-900 border-t-transparent rounded-full"></span>`;
    aiAnswerText.textContent = "Gemini 3.8 Flash가 대본을 분석하여 질문에 대한 답변과 타임스탬프를 탐색 중입니다...";
    jumpNowBtn.classList.add("hidden");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: currentVideoId,
          question: question,
          transcript: currentTranscript,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "답변 생성 실패");

      aiModelName.textContent = data.model || "Gemini 3.8 Flash";
      currentTargetSeconds = data.target_seconds || parseTimestampToSeconds(data.timestamp_str);

      // Convert timestamp tags into clickable buttons
      let formattedAnswer = data.answer.replace(
        /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g,
        (match, p1) => {
          const s = parseTimestampToSeconds(p1);
          return `<span class="ts-badge" onclick="window.seekAndPlayGlobal(${s})">▶ ${p1}</span>`;
        }
      );

      aiAnswerText.innerHTML = formattedAnswer;

      if (currentTargetSeconds > 0) {
        jumpNowBtn.classList.remove("hidden");
        jumpButtonText.textContent = `해당 위치로 재생 (${data.timestamp_str || formatSeconds(currentTargetSeconds)})`;
        seekAndPlay(currentTargetSeconds);
      }
    } catch (err) {
      aiAnswerText.textContent = `오류: ${err.message}`;
    } finally {
      askAiBtn.disabled = false;
      askAiBtn.innerHTML = `<span>검색</span><i data-lucide="send" class="w-3 h-3"></i>`;
      lucide.createIcons();
    }
  }

  askAiBtn.addEventListener("click", () => handleAskAi());
  aiQuestionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAskAi();
  });

  jumpNowBtn.addEventListener("click", () => {
    seekAndPlay(currentTargetSeconds);
  });

  // Quick Action Chips
  document.querySelectorAll(".quick-chip").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      const q = e.currentTarget.dataset.query;
      aiQuestionInput.value = q;
      handleAskAi(q);
    });
  });

  // Modal Transcript
  viewTranscriptBtn.addEventListener("click", () => {
    modalTranscriptContent.textContent = currentTranscript || "아직 생성된 대본이 없습니다. 상단에서 영상 로드 & AI 분석을 먼저 실행해주세요.";
    transcriptModal.classList.remove("hidden");
  });

  closeModalBtn.addEventListener("click", () => {
    transcriptModal.classList.add("hidden");
  });

  copyTranscriptBtn.addEventListener("click", () => {
    if (!currentTranscript) return alert("복사할 대본이 없습니다.");
    navigator.clipboard.writeText(currentTranscript).then(() => {
      alert("대본 전체가 클립보드에 복사되었습니다!");
    });
  });
});
