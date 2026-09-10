/**
 * AI YouTube Searcher Pro — Unified YouTube-Style Controller
 * - Silent Duplicate Guard
 * - Unified Right Panel (AI Q&A Tab & YouTube Chapters / Line-by-Line Transcript Tab)
 * - Interactive Timestamp Stamping & Bookmarking
 * - Gemini 3.8 Flash Video Navigation
 */

let ytPlayer = null;
let currentVideoId = "QgaTjRH5sqk";
let currentTranscript = "";
let currentChapters = [];
let currentBookmarks = [];
let isProcessing = false;
let pendingTimestampSeconds = 0;

// YouTube IFrame API Ready
window.onYouTubeIframeAPIReady = function () {
  try {
    ytPlayer = new YT.Player("ytIframe", {
      events: {
        onReady: () => console.log("YouTube Player ready"),
        onError: (e) => console.warn("Player error:", e),
      },
    });
  } catch (e) {}
};

// Post message to YouTube iframe
function postToIframe(action, args = []) {
  const iframe = document.getElementById("ytIframe");
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(
      JSON.stringify({
        event: "command",
        func: action,
        args: args,
      }),
      "*"
    );
  }
}

// Get current playback time
function getCurrentPlayerTime() {
  if (ytPlayer && ytPlayer.getCurrentTime) {
    try {
      const t = ytPlayer.getCurrentTime();
      if (typeof t === "number" && !isNaN(t)) return Math.floor(t);
    } catch (e) {}
  }
  return 0;
}

// Seek and Auto-Play
function seekAndPlay(seconds) {
  seconds = Math.max(0, parseInt(seconds, 10) || 0);
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

// Helper: Parse MM:SS to Seconds
function parseTimestampToSeconds(tsStr) {
  if (!tsStr) return 0;
  const clean = tsStr.replace(/[\[\]\(\)]/g, "").trim();
  const parts = clean.split(":");
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  } else if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  return 0;
}

// Helper: Format Seconds to MM:SS
function formatSeconds(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Extract Video ID
function extractVideoId(url) {
  const patterns = [
    /(?:v=|\/)([0-9A-Za-z_-]{11}).*/,
    /youtu\.be\/([0-9A-Za-z_-]{11})/,
    /shorts\/([0-9A-Za-z_-]{11})/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match) return match[1];
  }
  return null;
}

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  // DOM Elements
  const youtubeUrlInput = document.getElementById("youtubeUrlInput");
  const searchVideoBtn = document.getElementById("searchVideoBtn");
  const ytIframe = document.getElementById("ytIframe");
  const historyChipsContainer = document.getElementById("historyChipsContainer");

  const displayVideoTitle = document.getElementById("displayVideoTitle");
  const displayVideoChannel = document.getElementById("displayVideoChannel");
  const sttBadge = document.getElementById("sttBadge");
  const videoLoadingOverlay = document.getElementById("videoLoadingOverlay");
  const loadingStatusText = document.getElementById("loadingStatusText");

  const stampTimestampBtn = document.getElementById("stampTimestampBtn");
  const bookmarksContainer = document.getElementById("bookmarksContainer");
  const bookmarkCount = document.getElementById("bookmarkCount");
  const emptyBookmarkNotice = document.getElementById("emptyBookmarkNotice");

  const bookmarkModal = document.getElementById("bookmarkModal");
  const modalStampTime = document.getElementById("modalStampTime");
  const bookmarkMemoInput = document.getElementById("bookmarkMemoInput");
  const saveBookmarkBtn = document.getElementById("saveBookmarkBtn");
  const cancelBookmarkBtn = document.getElementById("cancelBookmarkBtn");
  const closeBookmarkModalBtn = document.getElementById("closeBookmarkModalBtn");

  // 3 Tabs
  const tabAiBtn = document.getElementById("tabAiBtn");
  const tabChaptersBtn = document.getElementById("tabChaptersBtn");
  const tabTranscriptBtn = document.getElementById("tabTranscriptBtn");
  const panelAiSection = document.getElementById("panelAiSection");
  const panelChaptersSection = document.getElementById("panelChaptersSection");
  const panelTranscriptSection = document.getElementById("panelTranscriptSection");

  const chaptersContainer = document.getElementById("chaptersContainer");
  const chapterCountBadge = document.getElementById("chapterCountBadge");
  const transcriptInteractiveList = document.getElementById("transcriptInteractiveList");
  const transcriptLineCount = document.getElementById("transcriptLineCount");
  const transcriptFilterInput = document.getElementById("transcriptFilterInput");

  const aiQuestionInput = document.getElementById("aiQuestionInput");
  const askAiBtn = document.getElementById("askAiBtn");
  const aiAnswerText = document.getElementById("aiAnswerText");
  const jumpNowBtn = document.getElementById("jumpNowBtn");
  const jumpButtonText = document.getElementById("jumpButtonText");
  const jumpActionSection = document.getElementById("jumpActionSection");
  const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");

  // Tab Switch Function
  function switchTab(activeTab) {
    // Reset all tabs
    [tabAiBtn, tabChaptersBtn, tabTranscriptBtn].forEach((btn) => {
      btn.classList.remove("active");
      btn.classList.add("text-stone-600");
    });
    [panelAiSection, panelChaptersSection, panelTranscriptSection].forEach((panel) => {
      panel.classList.add("hidden");
    });

    if (activeTab === "ai") {
      tabAiBtn.classList.add("active");
      tabAiBtn.classList.remove("text-stone-600");
      panelAiSection.classList.remove("hidden");
    } else if (activeTab === "chapters") {
      tabChaptersBtn.classList.add("active");
      tabChaptersBtn.classList.remove("text-stone-600");
      panelChaptersSection.classList.remove("hidden");
    } else if (activeTab === "transcript") {
      tabTranscriptBtn.classList.add("active");
      tabTranscriptBtn.classList.remove("text-stone-600");
      panelTranscriptSection.classList.remove("hidden");
    }
    lucide.createIcons();
  }

  tabAiBtn.addEventListener("click", () => switchTab("ai"));
  tabChaptersBtn.addEventListener("click", () => switchTab("chapters"));
  tabTranscriptBtn.addEventListener("click", () => switchTab("transcript"));

  // Load History Chips
  loadHistoryChips();

  // 1. Search Video & Full Pipeline (with Silent Duplicate Guard)
  async function handleSearch(overrideUrl = null) {
    if (isProcessing) return;

    const url = (overrideUrl || youtubeUrlInput.value).trim();
    if (!url) return;

    const nextVid = extractVideoId(url);
    if (!nextVid) {
      alert("올바른 유튜브 URL 형식이 아닙니다.");
      return;
    }

    // Silent Duplicate Guard: 이미 로드되어 활성화된 동일 영상인 경우 토스트/알림 없이 조용히 무시
    if (nextVid === currentVideoId && currentTranscript && ytIframe.src.includes(nextVid)) {
      return;
    }

    isProcessing = true;
    currentVideoId = nextVid;
    youtubeUrlInput.value = url;

    // Switch YouTube IFrame
    ytIframe.src = `https://www.youtube-nocookie.com/embed/${nextVid}?enablejsapi=1&playsinline=1&rel=0`;

    searchVideoBtn.disabled = true;
    searchVideoBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-stone-900 border-t-transparent rounded-full"></span><span>분석 중...</span>`;
    videoLoadingOverlay.classList.remove("hidden");
    loadingStatusText.textContent = "영상 메타데이터 및 자막 정보 확인 중...";

    // 1. Fetch info
    try {
      const infoRes = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        displayVideoTitle.textContent = info.title || "YouTube Video";
        displayVideoChannel.textContent = `${info.uploader || "YouTube"} • ${info.duration_string || ""}`;
      }
    } catch (e) {}

    // 2. Process Video (SSE Stream)
    sttBadge.textContent = "분석 진행 중...";
    sttBadge.className = "text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800";

    try {
      const processRes = await fetch("/api/process_video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!processRes.ok) {
        const err = await processRes.json();
        throw new Error(err.detail || "분석 실패");
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
                currentBookmarks = data.bookmarks || [];

                renderChapters(currentChapters);
                renderInteractiveTranscript(currentTranscript);
                renderBookmarks(currentBookmarks);

                // Source Type Badge
                const src = data.source_type || (data.cached ? "CSV 캐시" : "Gemini 3.5 STT");
                if (src.includes("플러그인") || src.includes("자막")) {
                  sttBadge.textContent = "⚡ 유튜브 자막 플러그인 (토큰 0)";
                  sttBadge.className = "text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200";
                } else if (data.cached || src.includes("캐시")) {
                  sttBadge.textContent = "⚡ CSV 캐시 불러옴 (토큰 0)";
                  sttBadge.className = "text-xs font-bold px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200";
                } else {
                  sttBadge.textContent = "✨ Gemini 3.5 STT 완료";
                  sttBadge.className = "text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200";
                }

                videoLoadingOverlay.classList.add("hidden");
                loadHistoryChips();
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
      isProcessing = false;
      searchVideoBtn.disabled = false;
      searchVideoBtn.innerHTML = `<span>영상 로드 & AI 분석</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      lucide.createIcons();
    }
  }

  searchVideoBtn.addEventListener("click", () => handleSearch());
  youtubeUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });

  // Load History Chips
  async function loadHistoryChips() {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          historyChipsContainer.innerHTML = "";
          data.items.slice(0, 8).forEach((item) => {
            const btn = document.createElement("button");
            const isActive = item.video_id === currentVideoId;
            btn.className = `history-chip ${isActive ? "active" : ""}`;
            btn.title = item.title;
            btn.innerHTML = `<span>${item.title || item.video_id}</span>`;
            btn.addEventListener("click", () => {
              if (item.url) handleSearch(item.url);
            });
            historyChipsContainer.appendChild(btn);
          });
        }
      }
    } catch (e) {}
  }

  // 2. Render Chapters in Tab 2 (주요 목차)
  function renderChapters(chapters) {
    if (!chapters || chapters.length === 0) {
      chaptersContainer.innerHTML = `<p class="text-xs text-stone-400 italic p-3">목차 데이터가 없습니다.</p>`;
      if (chapterCountBadge) chapterCountBadge.textContent = "0개 챕터";
      return;
    }
    chaptersContainer.innerHTML = "";
    if (chapterCountBadge) chapterCountBadge.textContent = `${chapters.length}개 챕터`;

    chapters.forEach((ch, idx) => {
      const sec = ch.timestamp_seconds ?? parseTimestampToSeconds(ch.timestamp_str);
      const card = document.createElement("div");
      card.className = "chapter-card flex items-center justify-between gap-3 group";
      card.innerHTML = `
        <div class="flex items-start gap-3 overflow-hidden">
          <div class="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
            ${idx + 1}
          </div>
          <div class="overflow-hidden space-y-0.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-bold text-stone-900 group-hover:text-indigo-600 transition truncate">${ch.title}</span>
              ${ch.category ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-medium">${ch.category}</span>` : ""}
            </div>
            ${ch.summary ? `<p class="text-[11px] text-stone-500 line-clamp-2">${ch.summary}</p>` : ""}
          </div>
        </div>
        <button class="ts-badge shrink-0 px-2.5 py-1 text-xs" title="해당 시간으로 이동">
          <i data-lucide="play" class="w-3 h-3 fill-lime-300"></i>
          <span>${ch.timestamp_str}</span>
        </button>
      `;

      card.addEventListener("click", () => seekAndPlay(sec));
      chaptersContainer.appendChild(card);
    });
    lucide.createIcons();
  }

  // 3. Render 10-Second Interval Segmented Transcript in Tab 3
  let parsedTranscriptIntervals = [];

  function renderInteractiveTranscript(transcriptText) {
    if (!transcriptText) {
      transcriptInteractiveList.innerHTML = `<p class="text-xs text-stone-400 italic p-3">대본 데이터가 없습니다.</p>`;
      if (transcriptLineCount) transcriptLineCount.textContent = "0개 구간 (10초 단위)";
      return;
    }

    parsedTranscriptIntervals = [];
    const rawLines = transcriptText.split("\n");
    let rawItems = [];

    rawLines.forEach((line) => {
      line = line.trim();
      if (!line) return;

      const tsMatch = line.match(/^\[?(\d{1,2}:\d{2})\]?\s*(.*)$/);
      if (tsMatch) {
        const timeStr = tsMatch[1];
        const contentText = tsMatch[2].trim();
        const sec = parseTimestampToSeconds(timeStr);
        if (contentText) {
          rawItems.push({ sec, timeStr, text: contentText });
        }
      } else {
        rawItems.push({ sec: -1, timeStr: null, text: line });
      }
    });

    const hasTimestamps = rawItems.some((item) => item.sec >= 0);

    if (hasTimestamps) {
      // Group into 10-second intervals
      const bucketMap = new Map();

      rawItems.forEach((item) => {
        let sec = item.sec >= 0 ? item.sec : 0;
        const bucketIdx = Math.floor(sec / 10);
        const startSec = bucketIdx * 10;
        const endSec = startSec + 10;

        if (!bucketMap.has(bucketIdx)) {
          bucketMap.set(bucketIdx, {
            startSec,
            endSec,
            rangeStr: `${formatSeconds(startSec)} ~ ${formatSeconds(endSec)}`,
            texts: [],
          });
        }
        bucketMap.get(bucketIdx).texts.push(item.text);
      });

      const sortedKeys = Array.from(bucketMap.keys()).sort((a, b) => a - b);
      sortedKeys.forEach((key) => {
        const bucket = bucketMap.get(key);
        parsedTranscriptIntervals.push({
          startSec: bucket.startSec,
          endSec: bucket.endSec,
          rangeStr: bucket.rangeStr,
          text: bucket.texts.join(" "),
        });
      });
    } else {
      // Plain text: Split by sentences and distribute across 10-second slots
      const fullText = rawItems.map((it) => it.text).join(" ");
      const sentences = fullText.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);
      const totalBuckets = Math.max(1, Math.min(Math.ceil(sentences.length / 2), 12));
      const sentencesPerBucket = Math.ceil(sentences.length / totalBuckets);

      for (let i = 0; i < totalBuckets; i++) {
        const startSec = i * 10;
        const endSec = startSec + 10;
        const slice = sentences.slice(i * sentencesPerBucket, (i + 1) * sentencesPerBucket);
        if (slice.length > 0) {
          parsedTranscriptIntervals.push({
            startSec,
            endSec,
            rangeStr: `${formatSeconds(startSec)} ~ ${formatSeconds(endSec)}`,
            text: slice.join(" "),
          });
        }
      }
    }

    if (transcriptLineCount) {
      transcriptLineCount.textContent = `${parsedTranscriptIntervals.length}개 구간 (10초 단위)`;
    }

    displayFilteredTranscript(parsedTranscriptIntervals);
  }

  function displayFilteredTranscript(intervals) {
    transcriptInteractiveList.innerHTML = "";
    if (intervals.length === 0) {
      transcriptInteractiveList.innerHTML = `<p class="text-xs text-stone-400 italic p-3">일치하는 대본 내용이 없습니다.</p>`;
      return;
    }

    intervals.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "transcript-line group flex items-start gap-3 p-3 bg-white hover:bg-stone-50 border border-stone-200 hover:border-stone-300 rounded-xl cursor-pointer transition shadow-xs";
      row.innerHTML = `
        <div class="flex flex-col items-center gap-1 shrink-0">
          <span class="transcript-ts font-mono text-[11px] font-bold px-2 py-1 rounded-md bg-stone-900 text-[#d8f967]">
            ⏱️ ${item.rangeStr}
          </span>
          <span class="text-[10px] text-stone-400 font-medium">#${idx + 1} 구간</span>
        </div>
        <div class="flex-1 text-xs text-stone-800 leading-relaxed font-medium">
          ${item.text}
        </div>
        <button class="shrink-0 p-1.5 rounded-lg bg-stone-100 group-hover:bg-[#d8f967] group-hover:text-stone-900 text-stone-500 transition self-center" title="이 10초 구간 재생">
          <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
        </button>
      `;

      row.addEventListener("click", () => {
        seekAndPlay(item.startSec);
        document.querySelectorAll(".transcript-line").forEach((el) => el.classList.remove("playing"));
        row.classList.add("playing");
      });

      transcriptInteractiveList.appendChild(row);
    });
    lucide.createIcons();
  }

  // Keyword filter in transcript tab
  if (transcriptFilterInput) {
    transcriptFilterInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        displayFilteredTranscript(parsedTranscriptIntervals);
      } else {
        const filtered = parsedTranscriptIntervals.filter((item) =>
          item.text.toLowerCase().includes(q) || item.rangeStr.includes(q)
        );
        displayFilteredTranscript(filtered);
      }
    });
  }

  // 4. Timestamp Stamping & Bookmarks
  stampTimestampBtn.addEventListener("click", () => {
    const curSec = getCurrentPlayerTime();
    pendingTimestampSeconds = curSec;
    const timeStr = formatSeconds(curSec);
    modalStampTime.textContent = timeStr;
    bookmarkMemoInput.value = "";
    bookmarkModal.classList.remove("hidden");
    bookmarkMemoInput.focus();
  });

  function closeBookmarkModal() {
    bookmarkModal.classList.add("hidden");
  }
  cancelBookmarkBtn.addEventListener("click", closeBookmarkModal);
  closeBookmarkModalBtn.addEventListener("click", closeBookmarkModal);

  saveBookmarkBtn.addEventListener("click", async () => {
    const memo = bookmarkMemoInput.value.trim() || "기억하고 싶은 순간";
    const timeStr = formatSeconds(pendingTimestampSeconds);

    try {
      const res = await fetch("/api/bookmarks/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: currentVideoId,
          timestamp_seconds: pendingTimestampSeconds,
          timestamp_str: timeStr,
          memo: memo,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        currentBookmarks = data.bookmarks || [];
        renderBookmarks(currentBookmarks);
        closeBookmarkModal();
      }
    } catch (e) {
      alert("타임스탬프 저장 중 오류 발생");
    }
  });

  function renderBookmarks(bookmarks) {
    if (!bookmarks || bookmarks.length === 0) {
      bookmarksContainer.innerHTML = "";
      bookmarksContainer.appendChild(emptyBookmarkNotice);
      bookmarkCount.textContent = "0";
      return;
    }

    bookmarksContainer.innerHTML = "";
    bookmarkCount.textContent = String(bookmarks.length);

    bookmarks.forEach((bm) => {
      const pill = document.createElement("div");
      pill.className = "bookmark-pill group";
      pill.innerHTML = `
        <span class="ts-badge cursor-pointer" data-sec="${bm.timestamp_seconds}">▶ ${bm.timestamp_str}</span>
        <span class="text-xs font-semibold text-stone-800 cursor-pointer select-none" data-sec="${bm.timestamp_seconds}">${bm.memo}</span>
        <button class="text-stone-300 hover:text-rose-500 transition ml-1 p-0.5 cursor-pointer delete-bm" data-id="${bm.id}" title="삭제">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      `;

      pill.querySelector(".ts-badge").addEventListener("click", () => seekAndPlay(bm.timestamp_seconds));
      pill.querySelector("span:nth-child(2)").addEventListener("click", () => seekAndPlay(bm.timestamp_seconds));

      pill.querySelector(".delete-bm").addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteBookmark(bm.id);
      });

      bookmarksContainer.appendChild(pill);
    });

    lucide.createIcons();
  }

  async function deleteBookmark(bmId) {
    try {
      const res = await fetch(`/api/bookmarks/delete?video_id=${currentVideoId}&bookmark_id=${bmId}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        currentBookmarks = data.bookmarks || [];
        renderBookmarks(currentBookmarks);
      }
    } catch (e) {}
  }

  // 5. Gemini 3.8 AI Question Answering
  async function handleAiAsk(questionText) {
    const q = questionText || aiQuestionInput.value.trim();
    if (!q) {
      alert("질문을 입력해주세요.");
      return;
    }

    if (!currentTranscript) {
      alert("먼저 상단에서 영상 로드 및 대본 분석을 진행해주세요.");
      return;
    }

    askAiBtn.disabled = true;
    askAiBtn.innerHTML = `<span class="animate-spin inline-block w-3 h-3 border-2 border-stone-900 border-t-transparent rounded-full"></span>`;
    aiAnswerText.innerHTML = `<span class="text-stone-400 italic">Gemini 3.8 Flash가 대본에서 답변과 타임스탬프를 탐색 중입니다...</span>`;
    jumpActionSection.classList.add("hidden");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: currentVideoId,
          question: q,
          transcript: currentTranscript,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "답변 생성 실패");
      }

      const data = await res.json();
      const aiModelEl = document.getElementById("aiModelName");
      if (aiModelEl) aiModelEl.textContent = data.model || "gemini-3.8-flash";

      let formattedAnswer = data.answer.replace(/\[(\d{1,2}:\d{2})\]/g, (match, p1) => {
        const sec = parseTimestampToSeconds(p1);
        return `<span class="ts-badge" onclick="window.seekAndPlayGlobal(${sec})">▶ ${p1}</span>`;
      });

      if (data.matched_quote) {
        formattedAnswer += `<div class="mt-3 p-2.5 bg-stone-100 rounded-xl border border-stone-200 text-[11px] text-stone-600 font-mono"><strong>💡 대본 인용:</strong> "${data.matched_quote}"</div>`;
      }

      aiAnswerText.innerHTML = formattedAnswer;

      if (data.target_seconds !== undefined && data.target_seconds !== null) {
        jumpButtonText.textContent = `${data.timestamp_str || formatSeconds(data.target_seconds)} 장면 재생`;
        jumpNowBtn.onclick = () => seekAndPlay(data.target_seconds);
        jumpActionSection.classList.remove("hidden");
      }
    } catch (err) {
      aiAnswerText.innerHTML = `<span class="text-rose-600 font-semibold">오류: ${err.message}</span>`;
    } finally {
      askAiBtn.disabled = false;
      askAiBtn.innerHTML = `<span>검색</span><i data-lucide="send" class="w-3 h-3"></i>`;
      lucide.createIcons();
    }
  }

  askAiBtn.addEventListener("click", () => handleAiAsk());
  aiQuestionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAiAsk();
  });

  document.querySelectorAll(".quick-q-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      aiQuestionInput.value = btn.textContent.trim();
      handleAiAsk(btn.textContent.trim());
    });
  });

  // Copy Transcript
  copyTranscriptBtn.addEventListener("click", async () => {
    if (!currentTranscript) return;
    try {
      await navigator.clipboard.writeText(currentTranscript);
      alert("대본 전체가 클립보드에 복사되었습니다! 📋");
    } catch (e) {}
  });

  // Initial Auto-load for default video
  handleSearch("https://youtu.be/QgaTjRH5sqk?si=EGdE5B1OIF3aCJEg");
});
