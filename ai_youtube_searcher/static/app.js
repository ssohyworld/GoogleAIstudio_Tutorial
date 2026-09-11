/**
 * Auralis AI — Multimodal Video Searcher & Telemetry Hub Controller
 * - Theme Switcher (Dark Cyber Lime, Midnight Violet, Light Porcelain)
 * - YouTube IFrame API & postMessage sync
 * - SSE Streaming Video Processing & Transcripts
 * - Chapters & 10-Second Interval Segmented Transcripts
 * - Saved Keyframe Bookmarks & Memo Notes
 * - Gemini 3.8 Flash Multimodal Q&A with Timestamp Jump CTA
 */

let ytPlayer = null;
let currentVideoId = "QgaTjRH5sqk";
let currentTranscript = "";
let currentChapters = [];
let currentBookmarks = [];
let isProcessing = false;
let pendingTimestampSeconds = 0;

// Theme Controller (Dark & Light)
function setTheme(theme) {
  const root = document.documentElement;
  const btnDark = document.getElementById("btn-theme-dark");
  const btnLight = document.getElementById("btn-theme-light");

  [btnDark, btnLight].forEach((b) => b && b.classList.remove("active"));

  if (theme === "light") {
    theme = "light";
    root.className = "light";
    if (btnLight) btnLight.classList.add("active");
  } else {
    // default dark (Midnight Violet)
    theme = "dark";
    root.className = "dark";
    if (btnDark) btnDark.classList.add("active");
  }

  localStorage.setItem("auralis_theme", theme);
}
window.setThemeGlobal = (theme) => setTheme(theme);

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
  // Initialize Theme from localStorage (default to dark)
  const savedTheme = localStorage.getItem("auralis_theme") || "dark";
  setTheme(savedTheme);

  // Theme switch buttons event binding
  const btnDark = document.getElementById("btn-theme-dark");
  const btnLight = document.getElementById("btn-theme-light");

  if (btnDark) btnDark.addEventListener("click", () => setTheme("dark"));
  if (btnLight) btnLight.addEventListener("click", () => setTheme("light"));

  // DOM Elements
  const youtubeUrlInput = document.getElementById("youtubeUrlInput");
  const searchVideoBtn = document.getElementById("searchVideoBtn");
  const ytIframe = document.getElementById("ytIframe");
  const historyChipsContainer = document.getElementById("historyChipsContainer");
  const targetUrlDisplay = document.getElementById("targetUrlDisplay");

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

  // Tab Switcher
  function switchTab(activeTab) {
    [tabAiBtn, tabChaptersBtn, tabTranscriptBtn].forEach((btn) => {
      btn.className = "flex-1 py-2 px-2 rounded-xl font-label-sm text-xs text-center transition-all text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center justify-center gap-1.5 font-bold cursor-pointer";
    });
    [panelAiSection, panelChaptersSection, panelTranscriptSection].forEach((panel) => {
      panel.classList.add("hidden");
    });

    if (activeTab === "ai") {
      tabAiBtn.className = "flex-1 py-2 px-2 rounded-xl font-label-sm text-xs text-center transition-all bg-[var(--accent-purple)] text-white shadow-[0_0_12px_var(--accent-purple-glow)] flex items-center justify-center gap-1.5 font-bold cursor-pointer";
      panelAiSection.classList.remove("hidden");
    } else if (activeTab === "chapters") {
      tabChaptersBtn.className = "flex-1 py-2 px-2 rounded-xl font-label-sm text-xs text-center transition-all bg-[var(--accent-purple)] text-white shadow-[0_0_12px_var(--accent-purple-glow)] flex items-center justify-center gap-1.5 font-bold cursor-pointer";
      panelChaptersSection.classList.remove("hidden");
    } else if (activeTab === "transcript") {
      tabTranscriptBtn.className = "flex-1 py-2 px-2 rounded-xl font-label-sm text-xs text-center transition-all bg-[var(--accent-purple)] text-white shadow-[0_0_12px_var(--accent-purple-glow)] flex items-center justify-center gap-1.5 font-bold cursor-pointer";
      panelTranscriptSection.classList.remove("hidden");
    }
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

    // Update Target URL display
    if (targetUrlDisplay) {
      targetUrlDisplay.textContent = url.replace("https://", "").replace("http://", "");
    }

    // Silent Duplicate Guard
    if (nextVid === currentVideoId && currentTranscript && ytIframe.src.includes(nextVid)) {
      return;
    }

    isProcessing = true;
    currentVideoId = nextVid;
    youtubeUrlInput.value = url;

    // Switch YouTube IFrame
    ytIframe.src = `https://www.youtube-nocookie.com/embed/${nextVid}?enablejsapi=1&playsinline=1&rel=0`;

    searchVideoBtn.disabled = true;
    searchVideoBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span><span>분석 중...</span>`;
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
    sttBadge.className = "inline-flex px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-telemetry-tag text-[10px] uppercase font-bold";

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
                  sttBadge.textContent = "⚡ 유튜브 자막 플러그인 (토큰 0 소모)";
                  sttBadge.className = "inline-flex px-2 py-0.5 rounded bg-[var(--accent-lime-bg)] text-[var(--accent-lime-text)] border border-[var(--accent-lime)]/30 font-telemetry-tag text-[10px] uppercase font-bold";
                } else if (data.cached || src.includes("캐시")) {
                  sttBadge.textContent = "⚡ CSV 캐시 불러옴 (토큰 0 소모)";
                  sttBadge.className = "inline-flex px-2 py-0.5 rounded bg-purple-500/20 text-[var(--accent-purple)] border border-[var(--accent-purple)]/30 font-telemetry-tag text-[10px] uppercase font-bold";
                } else {
                  sttBadge.textContent = "✨ Gemini 3.5 STT 전사 완료";
                  sttBadge.className = "inline-flex px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-telemetry-tag text-[10px] uppercase font-bold";
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
      sttBadge.className = "inline-flex px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-telemetry-tag text-[10px] uppercase font-bold";
      videoLoadingOverlay.classList.add("hidden");
    } finally {
      isProcessing = false;
      searchVideoBtn.disabled = false;
      searchVideoBtn.innerHTML = `<span class="material-symbols-outlined text-[16px]">search</span><span>분석</span>`;
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
            btn.innerHTML = `
              <span class="material-symbols-outlined text-[13px] text-[var(--accent-purple)]">play_arrow</span>
              <span class="truncate">${item.title || item.video_id}</span>
            `;
            btn.addEventListener("click", () => {
              if (item.url) handleSearch(item.url);
            });
            historyChipsContainer.appendChild(btn);
          });
        }
      }
    } catch (e) {}
  }

  // 2. Render Chapters in Tab 2
  function renderChapters(chapters) {
    if (!chapters || chapters.length === 0) {
      chaptersContainer.innerHTML = `<p class="text-xs text-[var(--text-muted)] italic p-3">목차 데이터가 없습니다.</p>`;
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
          <div class="w-6 h-6 rounded-lg bg-[var(--bg-surface-high)] text-[var(--accent-purple)] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-[var(--border-subtle)] font-telemetry-timestamp">
            ${idx + 1}
          </div>
          <div class="overflow-hidden space-y-0.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-bold text-[var(--text-main)] group-hover:text-[var(--accent-purple)] transition truncate">${ch.title}</span>
              ${ch.category ? `<span class="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-surface-high)] text-[var(--text-muted)] font-telemetry-tag">${ch.category}</span>` : ""}
            </div>
            ${ch.summary ? `<p class="text-[11px] text-[var(--text-muted)] line-clamp-2">${ch.summary}</p>` : ""}
          </div>
        </div>
        <button class="ts-badge shrink-0 px-2.5 py-1 text-xs" title="해당 시간으로 이동">
          <span class="material-symbols-outlined text-[13px]">play_arrow</span>
          <span>${ch.timestamp_str}</span>
        </button>
      `;

      card.addEventListener("click", () => seekAndPlay(sec));
      chaptersContainer.appendChild(card);
    });
  }

  // 3. Render 10-Second Interval Segmented Transcript in Tab 3
  let parsedTranscriptIntervals = [];

  function renderInteractiveTranscript(transcriptText) {
    if (!transcriptText) {
      transcriptInteractiveList.innerHTML = `<p class="text-xs text-[var(--text-muted)] italic p-3">대본 데이터가 없습니다.</p>`;
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
      transcriptInteractiveList.innerHTML = `<p class="text-xs text-[var(--text-muted)] italic p-3">일치하는 대본 내용이 없습니다.</p>`;
      return;
    }

    intervals.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "transcript-line group flex items-start gap-3 p-3 rounded-xl cursor-pointer transition shadow-sm";
      row.innerHTML = `
        <div class="flex flex-col items-center gap-1 shrink-0">
          <span class="transcript-ts font-telemetry-timestamp text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--bg-surface-highest)] text-[var(--accent-lime)] border border-[var(--border-subtle)]">
            ⏱️ ${item.rangeStr}
          </span>
          <span class="text-[10px] text-[var(--text-dim)] font-telemetry-tag">#${idx + 1} 구간</span>
        </div>
        <div class="flex-1 text-xs text-[var(--text-main)] leading-relaxed font-medium">
          ${item.text}
        </div>
        <button class="shrink-0 p-1.5 rounded-lg bg-[var(--bg-surface-high)] group-hover:bg-[var(--accent-purple)] group-hover:text-white text-[var(--text-muted)] transition self-center" title="이 10초 구간 재생">
          <span class="material-symbols-outlined text-[14px]">play_arrow</span>
        </button>
      `;

      row.addEventListener("click", () => {
        seekAndPlay(item.startSec);
        document.querySelectorAll(".transcript-line").forEach((el) => el.classList.remove("playing"));
        row.classList.add("playing");
      });

      transcriptInteractiveList.appendChild(row);
    });
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
        <span class="text-xs font-semibold text-[var(--text-main)] cursor-pointer select-none" data-sec="${bm.timestamp_seconds}">${bm.memo}</span>
        <button class="text-[var(--text-dim)] hover:text-rose-500 transition ml-1 p-0.5 cursor-pointer delete-bm" data-id="${bm.id}" title="삭제">
          <span class="material-symbols-outlined text-[14px]">close</span>
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
    askAiBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>`;
    aiAnswerText.innerHTML = `<span class="text-[var(--text-muted)] italic font-telemetry-tag">Gemini 3.8 Flash가 대본에서 답변과 타임스탬프를 탐색 중입니다...</span>`;
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
        formattedAnswer += `<div class="mt-3 p-2.5 bg-[var(--bg-surface-high)] rounded-xl border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)] font-telemetry-tag"><strong>💡 대본 인용:</strong> "${data.matched_quote}"</div>`;
      }

      aiAnswerText.innerHTML = formattedAnswer;

      if (data.target_seconds !== undefined && data.target_seconds !== null) {
        jumpButtonText.textContent = `▶ ${data.timestamp_str || formatSeconds(data.target_seconds)} 장면으로 즉시 점프 & 재생하기`;
        jumpNowBtn.onclick = () => seekAndPlay(data.target_seconds);
        jumpActionSection.classList.remove("hidden");
      }
    } catch (err) {
      aiAnswerText.innerHTML = `<span class="text-rose-500 font-semibold">오류: ${err.message}</span>`;
    } finally {
      askAiBtn.disabled = false;
      askAiBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">send</span>`;
    }
  }

  askAiBtn.addEventListener("click", () => handleAiAsk());
  aiQuestionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAiAsk();
  });

  document.querySelectorAll(".quick-q-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      aiQuestionInput.value = btn.textContent.trim().replace(/^[✨⏱️]\s*/, "");
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

