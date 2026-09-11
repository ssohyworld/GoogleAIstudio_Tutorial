/**
 * AI YouTube Searcher Pro — Unified YouTube-Style Controller (TypeScript Version)
 * - Silent Duplicate Guard
 * - Unified Right Panel (AI Q&A Tab & YouTube Chapters / Line-by-Line Transcript Tab)
 * - Interactive Timestamp Stamping & Bookmarking
 * - Gemini 3.8 Flash Video Navigation
 */

// ==========================================
// 1. TypeScript Types & Interface Definitions
// ==========================================

export interface Chapter {
  timestamp_seconds?: number;
  timestamp_str: string;
  title: string;
  category?: string;
  summary?: string;
}

export interface Bookmark {
  id: string;
  timestamp_seconds: number;
  timestamp_str: string;
  memo: string;
}

export interface VideoInfo {
  title: string;
  uploader: string;
  duration_string: string;
  duration?: number;
}

export interface ProcessStreamProgress {
  status: "progress";
  message: string;
}

export interface ProcessStreamDone {
  status: "done";
  transcript: string;
  chapters?: Chapter[];
  bookmarks?: Bookmark[];
  source_type?: string;
  cached?: boolean;
}

export interface ProcessStreamError {
  status: "error";
  message: string;
}

export type ProcessStreamData = ProcessStreamProgress | ProcessStreamDone | ProcessStreamError;

export interface AskResponse {
  answer: string;
  model?: string;
  matched_quote?: string;
  target_seconds?: number | null;
  timestamp_str?: string;
}

export interface HistoryItem {
  video_id: string;
  title: string;
  url?: string;
}

export interface HistoryResponse {
  items: HistoryItem[];
}

export interface TranscriptInterval {
  startSec: number;
  endSec: number;
  rangeStr: string;
  text: string;
}

interface RawTranscriptItem {
  sec: number;
  timeStr: string | null;
  text: string;
}

// YouTube Player & Global Window Declarations
declare namespace YT {
  interface PlayerOptions {
    events?: {
      onReady?: () => void;
      onError?: (event: unknown) => void;
    };
  }

  class Player {
    constructor(elementId: string, options?: PlayerOptions);
    getCurrentTime(): number;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    playVideo(): void;
    pauseVideo(): void;
  }
}

declare const lucide: {
  createIcons: () => void;
};

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    seekAndPlayGlobal?: (sec: number) => void;
    YT: typeof YT;
  }
}

// ==========================================
// 2. Global State Variables
// ==========================================

let ytPlayer: YT.Player | null = null;
let currentVideoId: string = "QgaTjRH5sqk";
let currentTranscript: string = "";
let currentChapters: Chapter[] = [];
let currentBookmarks: Bookmark[] = [];
let isProcessing: boolean = false;
let pendingTimestampSeconds: number = 0;
let parsedTranscriptIntervals: TranscriptInterval[] = [];

// ==========================================
// 3. YouTube Player Helper Functions
// ==========================================

// YouTube IFrame API Ready Callback
window.onYouTubeIframeAPIReady = function (): void {
  try {
    ytPlayer = new window.YT.Player("ytIframe", {
      events: {
        onReady: () => console.log("YouTube Player ready"),
        onError: (e: unknown) => console.warn("Player error:", e),
      },
    });
  } catch (e) {}
};

// Post message to YouTube iframe (Fallback / Direct bridge)
function postToIframe(action: string, args: unknown[] = []): void {
  const iframe = document.getElementById("ytIframe") as HTMLIFrameElement | null;
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

// Get current playback time in seconds
function getCurrentPlayerTime(): number {
  if (ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
    try {
      const t = ytPlayer.getCurrentTime();
      if (typeof t === "number" && !isNaN(t)) return Math.floor(t);
    } catch (e) {}
  }
  return 0;
}

// Seek and Auto-Play
export function seekAndPlay(seconds: number): void {
  const validSec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (ytPlayer && typeof ytPlayer.seekTo === "function") {
    try {
      ytPlayer.seekTo(validSec, true);
      ytPlayer.playVideo();
    } catch (e) {}
  }
  postToIframe("seekTo", [validSec, true]);
  postToIframe("playVideo", []);
}
window.seekAndPlayGlobal = (sec: number) => seekAndPlay(sec);

// Helper: Parse MM:SS or HH:MM:SS to Seconds
export function parseTimestampToSeconds(tsStr: string): number {
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
export function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const remainingSec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(remainingSec).padStart(2, "0")}`;
}

// Extract Video ID from URL
export function extractVideoId(url: string): string | null {
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

// ==========================================
// 4. Main UI Event Listener & Handlers
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  // DOM Elements
  const youtubeUrlInput = document.getElementById("youtubeUrlInput") as HTMLInputElement | null;
  const searchVideoBtn = document.getElementById("searchVideoBtn") as HTMLButtonElement | null;
  const ytIframe = document.getElementById("ytIframe") as HTMLIFrameElement | null;
  const historyChipsContainer = document.getElementById("historyChipsContainer") as HTMLDivElement | null;

  const displayVideoTitle = document.getElementById("displayVideoTitle") as HTMLElement | null;
  const displayVideoChannel = document.getElementById("displayVideoChannel") as HTMLElement | null;
  const sttBadge = document.getElementById("sttBadge") as HTMLElement | null;
  const videoLoadingOverlay = document.getElementById("videoLoadingOverlay") as HTMLElement | null;
  const loadingStatusText = document.getElementById("loadingStatusText") as HTMLElement | null;

  const stampTimestampBtn = document.getElementById("stampTimestampBtn") as HTMLButtonElement | null;
  const bookmarksContainer = document.getElementById("bookmarksContainer") as HTMLDivElement | null;
  const bookmarkCount = document.getElementById("bookmarkCount") as HTMLElement | null;
  const emptyBookmarkNotice = document.getElementById("emptyBookmarkNotice") as HTMLElement | null;

  const bookmarkModal = document.getElementById("bookmarkModal") as HTMLElement | null;
  const modalStampTime = document.getElementById("modalStampTime") as HTMLElement | null;
  const bookmarkMemoInput = document.getElementById("bookmarkMemoInput") as HTMLInputElement | null;
  const saveBookmarkBtn = document.getElementById("saveBookmarkBtn") as HTMLButtonElement | null;
  const cancelBookmarkBtn = document.getElementById("cancelBookmarkBtn") as HTMLButtonElement | null;
  const closeBookmarkModalBtn = document.getElementById("closeBookmarkModalBtn") as HTMLButtonElement | null;

  // 3 Tabs
  const tabAiBtn = document.getElementById("tabAiBtn") as HTMLButtonElement | null;
  const tabChaptersBtn = document.getElementById("tabChaptersBtn") as HTMLButtonElement | null;
  const tabTranscriptBtn = document.getElementById("tabTranscriptBtn") as HTMLButtonElement | null;
  const panelAiSection = document.getElementById("panelAiSection") as HTMLElement | null;
  const panelChaptersSection = document.getElementById("panelChaptersSection") as HTMLElement | null;
  const panelTranscriptSection = document.getElementById("panelTranscriptSection") as HTMLElement | null;

  const chaptersContainer = document.getElementById("chaptersContainer") as HTMLDivElement | null;
  const chapterCountBadge = document.getElementById("chapterCountBadge") as HTMLElement | null;
  const transcriptInteractiveList = document.getElementById("transcriptInteractiveList") as HTMLDivElement | null;
  const transcriptLineCount = document.getElementById("transcriptLineCount") as HTMLElement | null;
  const transcriptFilterInput = document.getElementById("transcriptFilterInput") as HTMLInputElement | null;

  const aiQuestionInput = document.getElementById("aiQuestionInput") as HTMLInputElement | null;
  const askAiBtn = document.getElementById("askAiBtn") as HTMLButtonElement | null;
  const aiAnswerText = document.getElementById("aiAnswerText") as HTMLElement | null;
  const jumpNowBtn = document.getElementById("jumpNowBtn") as HTMLButtonElement | null;
  const jumpButtonText = document.getElementById("jumpButtonText") as HTMLElement | null;
  const jumpActionSection = document.getElementById("jumpActionSection") as HTMLElement | null;
  const copyTranscriptBtn = document.getElementById("copyTranscriptBtn") as HTMLButtonElement | null;

  // Tab Switch Function
  function switchTab(activeTab: "ai" | "chapters" | "transcript"): void {
    const tabs = [tabAiBtn, tabChaptersBtn, tabTranscriptBtn];
    tabs.forEach((btn) => {
      btn?.classList.remove("active");
      btn?.classList.add("text-stone-600");
    });
    [panelAiSection, panelChaptersSection, panelTranscriptSection].forEach((panel) => {
      panel?.classList.add("hidden");
    });

    if (activeTab === "ai") {
      tabAiBtn?.classList.add("active");
      tabAiBtn?.classList.remove("text-stone-600");
      panelAiSection?.classList.remove("hidden");
    } else if (activeTab === "chapters") {
      tabChaptersBtn?.classList.add("active");
      tabChaptersBtn?.classList.remove("text-stone-600");
      panelChaptersSection?.classList.remove("hidden");
    } else if (activeTab === "transcript") {
      tabTranscriptBtn?.classList.add("active");
      tabTranscriptBtn?.classList.remove("text-stone-600");
      panelTranscriptSection?.classList.remove("hidden");
    }
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }

  tabAiBtn?.addEventListener("click", () => switchTab("ai"));
  tabChaptersBtn?.addEventListener("click", () => switchTab("chapters"));
  tabTranscriptBtn?.addEventListener("click", () => switchTab("transcript"));

  // Load History Chips
  loadHistoryChips();

  // 1. Search Video & Full Pipeline (with Silent Duplicate Guard)
  async function handleSearch(overrideUrl: string | null = null): Promise<void> {
    if (isProcessing) return;

    const url = (overrideUrl || youtubeUrlInput?.value || "").trim();
    if (!url) return;

    const nextVid = extractVideoId(url);
    if (!nextVid) {
      alert("올바른 유튜브 URL 형식이 아닙니다.");
      return;
    }

    // Silent Duplicate Guard: 이미 로드되어 활성화된 동일 영상인 경우 조용히 무시
    if (nextVid === currentVideoId && currentTranscript && ytIframe?.src.includes(nextVid)) {
      return;
    }

    isProcessing = true;
    currentVideoId = nextVid;
    if (youtubeUrlInput) youtubeUrlInput.value = url;

    // Switch YouTube IFrame
    if (ytIframe) {
      ytIframe.src = `https://www.youtube-nocookie.com/embed/${nextVid}?enablejsapi=1&playsinline=1&rel=0`;
    }

    if (searchVideoBtn) {
      searchVideoBtn.disabled = true;
      searchVideoBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-stone-900 border-t-transparent rounded-full"></span><span>분석 중...</span>`;
    }
    videoLoadingOverlay?.classList.remove("hidden");
    if (loadingStatusText) {
      loadingStatusText.textContent = "영상 메타데이터 및 자막 정보 확인 중...";
    }

    // 1. Fetch info
    try {
      const infoRes = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (infoRes.ok) {
        const info: VideoInfo = await infoRes.json();
        if (displayVideoTitle) displayVideoTitle.textContent = info.title || "YouTube Video";
        if (displayVideoChannel) {
          displayVideoChannel.textContent = `${info.uploader || "YouTube"} • ${info.duration_string || ""}`;
        }
      }
    } catch (e) {}

    // 2. Process Video (SSE Stream)
    if (sttBadge) {
      sttBadge.textContent = "분석 진행 중...";
      sttBadge.className = "text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800";
    }

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

      if (!processRes.body) throw new Error("응답 본문이 비어있습니다.");

      const reader = processRes.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data: ProcessStreamData = JSON.parse(dataStr);
              if (data.status === "progress") {
                if (loadingStatusText) loadingStatusText.textContent = data.message;
              } else if (data.status === "done") {
                currentTranscript = data.transcript || "";
                currentChapters = data.chapters || [];
                currentBookmarks = data.bookmarks || [];

                renderChapters(currentChapters);
                renderInteractiveTranscript(currentTranscript);
                renderBookmarks(currentBookmarks);

                // Source Type Badge
                const src = data.source_type || (data.cached ? "CSV 캐시" : "Gemini 3.5 STT");
                if (sttBadge) {
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
                }

                videoLoadingOverlay?.classList.add("hidden");
                loadHistoryChips();
              } else if (data.status === "error") {
                throw new Error(data.message);
              }
            } catch (e) {}
          }
        }
      }
    } catch (err: any) {
      alert(`오류: ${err.message}`);
      if (sttBadge) {
        sttBadge.textContent = "오류 발생";
        sttBadge.className = "text-xs font-bold px-3 py-1 rounded-full bg-rose-100 text-rose-800";
      }
      videoLoadingOverlay?.classList.add("hidden");
    } finally {
      isProcessing = false;
      if (searchVideoBtn) {
        searchVideoBtn.disabled = false;
        searchVideoBtn.innerHTML = `<span>영상 로드 & AI 분석</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      }
      if (typeof lucide !== "undefined") {
        lucide.createIcons();
      }
    }
  }

  searchVideoBtn?.addEventListener("click", () => handleSearch());
  youtubeUrlInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  });

  // Load History Chips
  async function loadHistoryChips(): Promise<void> {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data: HistoryResponse = await res.json();
        if (data.items && data.items.length > 0 && historyChipsContainer) {
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
  function renderChapters(chapters: Chapter[]): void {
    if (!chaptersContainer) return;
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
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }

  // 3. Render 10-Second Interval Segmented Transcript in Tab 3
  function renderInteractiveTranscript(transcriptText: string): void {
    if (!transcriptInteractiveList) return;
    if (!transcriptText) {
      transcriptInteractiveList.innerHTML = `<p class="text-xs text-stone-400 italic p-3">대본 데이터가 없습니다.</p>`;
      if (transcriptLineCount) transcriptLineCount.textContent = "0개 구간 (10초 단위)";
      return;
    }

    parsedTranscriptIntervals = [];
    const rawLines = transcriptText.split("\n");
    const rawItems: RawTranscriptItem[] = [];

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
      const bucketMap = new Map<number, { startSec: number; endSec: number; rangeStr: string; texts: string[] }>();

      rawItems.forEach((item) => {
        const sec = item.sec >= 0 ? item.sec : 0;
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
        bucketMap.get(bucketIdx)?.texts.push(item.text);
      });

      const sortedKeys = Array.from(bucketMap.keys()).sort((a, b) => a - b);
      sortedKeys.forEach((key) => {
        const bucket = bucketMap.get(key);
        if (bucket) {
          parsedTranscriptIntervals.push({
            startSec: bucket.startSec,
            endSec: bucket.endSec,
            rangeStr: bucket.rangeStr,
            text: bucket.texts.join(" "),
          });
        }
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

  function displayFilteredTranscript(intervals: TranscriptInterval[]): void {
    if (!transcriptInteractiveList) return;
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
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }

  // Keyword filter in transcript tab
  transcriptFilterInput?.addEventListener("input", (e: Event) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase().trim();
    if (!q) {
      displayFilteredTranscript(parsedTranscriptIntervals);
    } else {
      const filtered = parsedTranscriptIntervals.filter((item) =>
        item.text.toLowerCase().includes(q) || item.rangeStr.includes(q)
      );
      displayFilteredTranscript(filtered);
    }
  });

  // 4. Timestamp Stamping & Bookmarks
  stampTimestampBtn?.addEventListener("click", () => {
    const curSec = getCurrentPlayerTime();
    pendingTimestampSeconds = curSec;
    const timeStr = formatSeconds(curSec);
    if (modalStampTime) modalStampTime.textContent = timeStr;
    if (bookmarkMemoInput) bookmarkMemoInput.value = "";
    bookmarkModal?.classList.remove("hidden");
    bookmarkMemoInput?.focus();
  });

  function closeBookmarkModal(): void {
    bookmarkModal?.classList.add("hidden");
  }
  cancelBookmarkBtn?.addEventListener("click", closeBookmarkModal);
  closeBookmarkModalBtn?.addEventListener("click", closeBookmarkModal);

  saveBookmarkBtn?.addEventListener("click", async () => {
    const memo = bookmarkMemoInput?.value.trim() || "기억하고 싶은 순간";
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

  function renderBookmarks(bookmarks: Bookmark[]): void {
    if (!bookmarksContainer) return;
    if (!bookmarks || bookmarks.length === 0) {
      bookmarksContainer.innerHTML = "";
      if (emptyBookmarkNotice) bookmarksContainer.appendChild(emptyBookmarkNotice);
      if (bookmarkCount) bookmarkCount.textContent = "0";
      return;
    }

    bookmarksContainer.innerHTML = "";
    if (bookmarkCount) bookmarkCount.textContent = String(bookmarks.length);

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

      pill.querySelector(".ts-badge")?.addEventListener("click", () => seekAndPlay(bm.timestamp_seconds));
      pill.querySelector("span:nth-child(2)")?.addEventListener("click", () => seekAndPlay(bm.timestamp_seconds));

      pill.querySelector(".delete-bm")?.addEventListener("click", async (e: Event) => {
        e.stopPropagation();
        await deleteBookmark(bm.id);
      });

      bookmarksContainer.appendChild(pill);
    });

    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }

  async function deleteBookmark(bmId: string): Promise<void> {
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
  async function handleAiAsk(questionText?: string): Promise<void> {
    const q = (questionText || aiQuestionInput?.value || "").trim();
    if (!q) {
      alert("질문을 입력해주세요.");
      return;
    }

    if (!currentTranscript) {
      alert("먼저 상단에서 영상 로드 및 대본 분석을 진행해주세요.");
      return;
    }

    if (askAiBtn) {
      askAiBtn.disabled = true;
      askAiBtn.innerHTML = `<span class="animate-spin inline-block w-3 h-3 border-2 border-stone-900 border-t-transparent rounded-full"></span>`;
    }
    if (aiAnswerText) {
      aiAnswerText.innerHTML = `<span class="text-stone-400 italic">Gemini 3.8 Flash가 대본에서 답변과 타임스탬프를 탐색 중입니다...</span>`;
    }
    jumpActionSection?.classList.add("hidden");

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

      const data: AskResponse = await res.json();
      const aiModelEl = document.getElementById("aiModelName");
      if (aiModelEl) aiModelEl.textContent = data.model || "gemini-3.8-flash";

      let formattedAnswer = data.answer.replace(/\[(\d{1,2}:\d{2})\]/g, (_match, p1) => {
        const sec = parseTimestampToSeconds(p1);
        return `<span class="ts-badge" onclick="window.seekAndPlayGlobal(${sec})">▶ ${p1}</span>`;
      });

      if (data.matched_quote) {
        formattedAnswer += `<div class="mt-3 p-2.5 bg-stone-100 rounded-xl border border-stone-200 text-[11px] text-stone-600 font-mono"><strong>💡 대본 인용:</strong> "${data.matched_quote}"</div>`;
      }

      if (aiAnswerText) {
        aiAnswerText.innerHTML = formattedAnswer;
      }

      if (data.target_seconds !== undefined && data.target_seconds !== null) {
        if (jumpButtonText) {
          jumpButtonText.textContent = `${data.timestamp_str || formatSeconds(data.target_seconds)} 장면 재생`;
        }
        if (jumpNowBtn) {
          jumpNowBtn.onclick = () => seekAndPlay(data.target_seconds!);
        }
        jumpActionSection?.classList.remove("hidden");
      }
    } catch (err: any) {
      if (aiAnswerText) {
        aiAnswerText.innerHTML = `<span class="text-rose-600 font-semibold">오류: ${err.message}</span>`;
      }
    } finally {
      if (askAiBtn) {
        askAiBtn.disabled = false;
        askAiBtn.innerHTML = `<span>검색</span><i data-lucide="send" class="w-3 h-3"></i>`;
      }
      if (typeof lucide !== "undefined") {
        lucide.createIcons();
      }
    }
  }

  askAiBtn?.addEventListener("click", () => handleAiAsk());
  aiQuestionInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") handleAiAsk();
  });

  document.querySelectorAll<HTMLButtonElement>(".quick-q-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.textContent?.trim() || "";
      if (aiQuestionInput) aiQuestionInput.value = q;
      handleAiAsk(q);
    });
  });

  // Copy Transcript
  copyTranscriptBtn?.addEventListener("click", async () => {
    if (!currentTranscript) return;
    try {
      await navigator.clipboard.writeText(currentTranscript);
      alert("대본 전체가 클립보드에 복사되었습니다! 📋");
    } catch (e) {}
  });

  // Initial Auto-load for default video
  handleSearch("https://youtu.be/QgaTjRH5sqk?si=EGdE5B1OIF3aCJEg");
});
