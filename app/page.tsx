"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Rss,
  Plus,
  X,
  Camera,
  Sparkles,
  Send,
  Check,
  Loader2,
  ExternalLink,
  Settings2,
  ChevronRight,
  Bookmark,
  Search,
  Download,
  Calendar,
  Layers,
  Palette,
  Clock,
  Trash2,
} from "lucide-react";
import type {
  FeedArticle,
  SavedFeed,
  CaptionTone,
  CardTemplateTheme,
  CardAspectRatio,
  ScheduledPost,
} from "@/lib/types";
import { drawCardToCanvas } from "@/lib/cardCanvas";

const FEED_COLORS = ["#8B5CF6", "#EC4899", "#06B6D4", "#F59E0B", "#10B981", "#F43F5E"];
const STORAGE_KEY = "feedgram:feeds:v1";
const BOOKMARKS_STORAGE_KEY = "feedgram:bookmarks:v1";
const SCHEDULED_STORAGE_KEY = "feedgram:scheduled:v1";

const SEED_FEEDS: Array<{ url: string; name: string }> = [
  { url: "https://technologyreview.com/feed/", name: "MIT Tech Review" },
  { url: "https://www.yna.co.kr/rss/news.xml", name: "연합뉴스" },
  { url: "http://rss.kbench.com/news.xml", name: "케이벤치 IT" },
];

type Feed = SavedFeed & { loading?: boolean; error?: boolean; errorMsg?: string };
type Article = FeedArticle & { feedId: string };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}일 전`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function errorLabel(errCode: string | undefined) {
  switch (errCode) {
    case "TIMEOUT":
      return "응답 시간 초과";
    case "EMPTY_FEED":
      return "기사를 찾지 못함";
    case "INVALID_URL":
      return "올바르지 않은 주소";
    case "FETCH_FAILED":
      return "피드 가져오기 실패";
    default:
      return "불러오기 실패";
  }
}

export default function Home() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingCount, setLoadingCount] = useState(0);
  const [activeFeedId, setActiveFeedId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  const [selected, setSelected] = useState<Article | null>(null);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [feedInput, setFeedInput] = useState("");
  const [feedNameInput, setFeedNameInput] = useState("");
  const [addError, setAddError] = useState("");

  // AI Caption State & Tone
  const [caption, setCaption] = useState("");
  const [captionTone, setCaptionTone] = useState<CaptionTone>("professional");
  const [generating, setGenerating] = useState(false);

  // Card News Canvas Generator State
  const [cardTheme, setCardTheme] = useState<CardTemplateTheme>("dark");
  const [cardAspectRatio, setCardAspectRatio] = useState<CardAspectRatio>("1:1");
  const [showCardCanvasModal, setShowCardCanvasModal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Posting & Scheduler State
  const [posting, setPosting] = useState(false);
  const [postResultMsg, setPostResultMsg] = useState<string | null>(null);
  const [postMode, setPostMode] = useState<"idle" | "posted" | "error">("idle");
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [activeTab, setActiveTab] = useState<"editor" | "scheduler">("editor");
  const [igConnected, setIgConnected] = useState<boolean | null>(null);
  const [igUsername, setIgUsername] = useState<string | null>(null);

  const [showInfo, setShowInfo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const colorIdx = useRef(0);

  const nextColor = () => {
    const c = FEED_COLORS[colorIdx.current % FEED_COLORS.length];
    colorIdx.current += 1;
    return c;
  };

  const loadFeed = useCallback(async (feed: Feed) => {
    setLoadingCount((n) => n + 1);
    setFeeds((prev) => prev.map((f) => (f.id === feed.id ? { ...f, loading: true, error: false } : f)));
    try {
      const res = await fetch(`/api/feed?url=${encodeURIComponent(feed.url)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "FETCH_FAILED");
      }
      setFeeds((prev) =>
        prev.map((f) =>
          f.id === feed.id
            ? { ...f, name: f.customName || data.channelTitle || f.name, error: false, loading: false }
            : f
        )
      );
      setArticles((prev) => {
        const others = prev.filter((a) => a.feedId !== feed.id);
        const withFeed: Article[] = (data.items as FeedArticle[]).map((it) => ({ ...it, feedId: feed.id }));
        return [...others, ...withFeed].sort(
          (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
        );
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : "FETCH_FAILED";
      const label = errorLabel(code);
      setFeeds((prev) =>
        prev.map((f) => (f.id === feed.id ? { ...f, error: true, errorMsg: label, loading: false } : f))
      );
      setToast(`"${feed.customName || feed.name}" ${label}`);
      setTimeout(() => setToast(null), 3200);
    } finally {
      setLoadingCount((n) => Math.max(0, n - 1));
    }
  }, []);

  // Hydration & Storage Loading
  useEffect(() => {
    let initial: Feed[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: SavedFeed[] = JSON.parse(raw);
        initial = saved.map((f) => ({ ...f }));
        colorIdx.current = saved.length;
      }

      const rawBookmarks = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY);
      if (rawBookmarks) setBookmarks(JSON.parse(rawBookmarks));

      const rawScheduled = window.localStorage.getItem(SCHEDULED_STORAGE_KEY);
      if (rawScheduled) setScheduledPosts(JSON.parse(rawScheduled));
    } catch {
      initial = [];
    }

    if (initial.length === 0) {
      initial = SEED_FEEDS.map((s) => ({
        id: uid(),
        url: s.url,
        name: s.name,
        customName: s.name,
        color: nextColor(),
      }));
    }

    setFeeds(initial);
    initial.forEach((f) => loadFeed(f));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save Feeds, Bookmarks, and Schedules to LocalStorage
  useEffect(() => {
    if (!hydrated) return;
    const toSave: SavedFeed[] = feeds.map(({ id, url, name, customName, color }) => ({
      id,
      url,
      name,
      customName,
      color,
    }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }, [feeds, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  }, [bookmarks, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SCHEDULED_STORAGE_KEY, JSON.stringify(scheduledPosts));
  }, [scheduledPosts, hydrated]);

  // Bookmark Toggle
  const toggleBookmark = (articleId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setBookmarks((prev) => {
      const exists = prev.includes(articleId);
      const next = exists ? prev.filter((id) => id !== articleId) : [...prev, articleId];
      setToast(exists ? "북마크에서 제거되었습니다." : "북마크함에 보관되었습니다 ✨");
      setTimeout(() => setToast(null), 2000);
      return next;
    });
  };

  const handleAddFeed = () => {
    const url = feedInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setAddError("http:// 또는 https:// 주소를 정확히 입력해 주세요.");
      return;
    }
    if (feeds.some((f) => f.url === url)) {
      setAddError("이미 등록된 RSS 주소입니다.");
      return;
    }
    setAddError("");
    const feed: Feed = {
      id: uid(),
      url,
      name: feedNameInput.trim() || url,
      customName: feedNameInput.trim() || null,
      color: nextColor(),
    };
    setFeeds((prev) => [...prev, feed]);
    setFeedInput("");
    setFeedNameInput("");
    setShowAddFeed(false);
    loadFeed(feed);
  };

  const removeFeed = (id: string) => {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    setArticles((prev) => prev.filter((a) => a.feedId !== id));
    if (activeFeedId === id) setActiveFeedId("all");
    if (selected?.feedId === id) setSelected(null);
  };

  // Article Filtering
  const filteredArticles = articles.filter((a) => {
    if (showBookmarksOnly && !bookmarks.includes(a.id)) return false;
    if (activeFeedId !== "all" && a.feedId !== activeFeedId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = a.title.toLowerCase().includes(q);
      const matchDesc = a.description?.toLowerCase().includes(q);
      return matchTitle || matchDesc;
    }
    return true;
  });

  const feedById = (id: string) => feeds.find((f) => f.id === id);

  const selectArticle = (article: Article) => {
    setSelected(article);
    setCaption("");
    setPostMode("idle");
    setPostResultMsg(null);
  };

  // AI Caption Generator with Tone
  const generateCaption = async (tone: CaptionTone = captionTone) => {
    if (!selected) return;
    setGenerating(true);
    setCaptionTone(tone);
    try {
      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selected.title,
          description: selected.description,
          tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCaption(data?.message || "캡션 생성 실패");
        return;
      }
      setCaption(data.caption || "");
    } catch {
      setCaption("캡션 생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  // Render Canvas Image Preview / Download
  const handleRenderCanvas = useCallback(() => {
    if (!selected || !canvasRef.current) return;
    const f = feedById(selected.feedId);
    drawCardToCanvas(canvasRef.current, {
      title: selected.title,
      description: selected.description,
      caption: caption,
      sourceName: f?.name || "Feed4Grams",
      imageUrl: selected.image,
      theme: cardTheme,
      aspectRatio: cardAspectRatio,
    });
  }, [selected, caption, cardTheme, cardAspectRatio, feeds]);

  useEffect(() => {
    if (showCardCanvasModal) {
      handleRenderCanvas();
    }
  }, [showCardCanvasModal, caption, cardTheme, cardAspectRatio, handleRenderCanvas]);

  const downloadCanvasImage = () => {
    if (!canvasRef.current || !selected) return;
    const link = document.createElement("a");
    link.download = `feedgram-card-${selected.id.slice(0, 6)}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    setToast("카드뉴스 PNG 이미지가 저장되었습니다! 🎨");
    setTimeout(() => setToast(null), 2500);
  };

  // Instagram 연결 상태 확인
  useEffect(() => {
    fetch("/api/instagram")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.connected) {
          setIgConnected(true);
          setIgUsername(d.account?.username || null);
        } else {
          setIgConnected(false);
        }
      })
      .catch(() => setIgConnected(false));
  }, []);

  const handlePost = async () => {
    if (!selected || posting) return;
    setPosting(true);
    setPostResultMsg(null);
    try {
      const res = await fetch("/api/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: selected.image, caption }),
      });
      const data = await res.json();
      if (data.ok) {
        setPostMode("posted");
        setPostResultMsg(data.permalink ? `게시 완료: ${data.permalink}` : "게시가 완료되었습니다.");
        setToast("인스타그램에 성공적으로 포스팅되었습니다! 🚀");
        setTimeout(() => setToast(null), 2600);
      } else {
        setPostMode("error");
        setPostResultMsg(data.message || "게시에 실패했습니다.");
      }
    } catch {
      setPostMode("error");
      setPostResultMsg("네트워크 오류로 게시하지 못했습니다.");
    } finally {
      setPosting(false);
    }
  };

  const handleAddSchedule = () => {
    if (!selected || !scheduleTime) return;
    const newSchedule: ScheduledPost = {
      id: uid(),
      articleTitle: selected.title,
      feedName: feedById(selected.feedId)?.name || "RSS Feed",
      scheduledTime: scheduleTime,
      status: "scheduled",
    };
    setScheduledPosts((prev) => [newSchedule, ...prev]);
    setShowScheduleModal(false);
    setScheduleTime("");
    setToast("포스팅 예약 일정이 등록되었습니다! 📅");
    setTimeout(() => setToast(null), 2500);
  };

  const removeSchedule = (id: string) => {
    setScheduledPosts((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="w-full min-h-screen text-[#F1F5F9] selection:bg-purple-500 selection:text-white">
      {/* Top Header - Glassmorphism */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 sm:px-10 py-4 glass-panel border-b border-white/10 shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-gradient-to-br from-violet-600 via-purple-600 to-pink-500 shadow-lg shadow-purple-500/25">
            <Rss size={20} color="#FFFFFF" strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-display text-2xl font-extrabold tracking-tight text-gradient">
                FEED4GRAMS
              </span>
              <span className="px-2.5 py-0.5 rounded-full font-mono-ui text-[10px] font-bold bg-purple-500/20 border border-purple-500/30 text-purple-300">
                Studio PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
              RSS Feed Automation & AI Card News Publisher
            </p>
          </div>
        </div>

        {/* Tab Navigation & Buttons */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex bg-slate-900/80 p-1 rounded-full border border-white/10 shadow-inner">
            <button
              onClick={() => setActiveTab("editor")}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeTab === "editor"
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-purple-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              콘텐츠 큐레이터
            </button>
            <button
              onClick={() => setActiveTab("scheduler")}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "scheduler"
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-purple-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Calendar size={13} />
              발행 일정
              {scheduledPosts.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-pink-500 text-white text-[9px] font-extrabold flex items-center justify-center">
                  {scheduledPosts.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowAddFeed(true)}
            className="flex items-center gap-1.5 rounded-full px-4.5 py-2 text-xs font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 text-white shadow-lg shadow-purple-500/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={15} /> 피드 추가
          </button>
          <button
            onClick={() => setShowInfo(true)}
            aria-label="설정 및 안내"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-slate-800/80 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      {/* Main Layout Container */}
      <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-[260px_1fr_400px] gap-0 min-h-[calc(100vh-73px)]">
        {/* Left Sidebar: RSS Feeds & Quick Views */}
        <aside className="hidden lg:block px-6 py-7 border-r border-white/5 bg-slate-950/40">
          <div className="space-y-7">
            {/* Quick Curation Views */}
            <div>
              <div className="font-mono-ui text-[10px] uppercase tracking-widest mb-3 text-slate-400 font-bold">
                큐레이션 뷰
              </div>
              <nav className="flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    setActiveFeedId("all");
                    setShowBookmarksOnly(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold text-left transition-all ${
                    activeFeedId === "all" && !showBookmarksOnly
                      ? "bg-gradient-to-r from-violet-600/30 to-purple-600/30 border border-purple-500/50 text-white shadow-lg shadow-purple-500/10"
                      : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Layers size={15} className="text-purple-400" /> 전체 기사
                  </span>
                  <span className="font-mono-ui text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                    {articles.length}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setShowBookmarksOnly(true);
                    setActiveFeedId("all");
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold text-left transition-all ${
                    showBookmarksOnly
                      ? "bg-gradient-to-r from-pink-600/30 to-purple-600/30 border border-pink-500/50 text-white shadow-lg shadow-pink-500/10"
                      : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Bookmark size={15} className="fill-pink-500 text-pink-500" /> 북마크함
                  </span>
                  <span className="font-mono-ui text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                    {bookmarks.length}
                  </span>
                </button>
              </nav>
            </div>

            {/* RSS Feed Subscriptions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono-ui text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                  구독 RSS 피드 · {feeds.length}
                </span>
              </div>
              <nav className="flex flex-col gap-1.5 max-h-[calc(100vh-340px)] overflow-y-auto fg-scroll pr-1">
                {feeds.map((f) => (
                  <div key={f.id} className="group relative">
                    <button
                      onClick={() => {
                        setActiveFeedId(f.id);
                        setShowBookmarksOnly(false);
                      }}
                      className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-bold text-left pr-8 transition-all ${
                        activeFeedId === f.id && !showBookmarksOnly
                          ? "bg-slate-800/90 border border-white/10 text-white shadow-md"
                          : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                      }`}
                    >
                      {f.loading ? (
                        <Loader2 size={13} className="fg-spin shrink-0 text-purple-400" />
                      ) : (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                          style={{ background: f.color, boxShadow: `0 0 8px ${f.color}88` }}
                        />
                      )}
                      <span className="truncate flex-1">{f.name}</span>
                    </button>
                    <button
                      onClick={() => removeFeed(f.id)}
                      aria-label={`${f.name} 피드 삭제`}
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400 transition-all"
                    >
                      <X size={13} />
                    </button>
                    {f.error && (
                      <div className="flex items-center justify-between pl-3 pr-2 mt-1">
                        <span className="text-[10px] text-red-400">{f.errorMsg || "오류"}</span>
                        <button
                          onClick={() => loadFeed(f)}
                          className="text-[10px] font-bold text-purple-400 hover:underline"
                        >
                          재시도
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </nav>
            </div>
          </div>
        </aside>

        {/* Center Main Content Area */}
        <main className="px-6 sm:px-10 py-7">
          {activeTab === "scheduler" ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <h1 className="font-display text-xl font-bold text-white flex items-center gap-2.5">
                    <Calendar size={22} className="text-purple-400" />
                    인스타그램 포스팅 예약 대기열
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    스케줄링된 카드뉴스 발행 일정을 한눈에 관리합니다.
                  </p>
                </div>
              </div>

              {scheduledPosts.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center py-20 px-6 bg-slate-900/30 backdrop-blur">
                  <Calendar size={36} className="text-purple-400/50 mb-3" />
                  <p className="font-bold text-slate-200">예약된 포스팅이 없습니다</p>
                  <p className="text-xs mt-1 text-slate-400">
                    우측 AI Studio 미리보기 창에서 &apos;포스팅 예약&apos; 버튼으로 일정을 추가해 보세요.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {scheduledPosts.map((sp) => (
                    <div
                      key={sp.id}
                      className="p-5 rounded-2xl glass-panel border border-white/10 hover:border-purple-500/40 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs font-mono-ui mb-3">
                          <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                            {sp.feedName}
                          </span>
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <Clock size={13} className="text-purple-400" /> {sp.scheduledTime}
                          </span>
                        </div>
                        <h4 className="font-bold text-sm text-slate-100 line-clamp-2 leading-snug">
                          {sp.articleTitle}
                        </h4>
                      </div>
                      <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/5">
                        <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />{" "}
                          예약 됨
                        </span>
                        <button
                          onClick={() => removeSchedule(sp.id)}
                          className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1 transition-colors"
                        >
                          <Trash2 size={13} /> 예약 취소
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Filter Header & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
                <div className="relative flex-1 max-w-lg">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="실시간 기사 검색 (제목, 요약 키워드)..."
                    className="w-full pl-11 pr-4 py-2.5 text-xs font-semibold rounded-2xl bg-slate-900/90 border border-white/10 text-slate-100 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 shadow-inner transition-all placeholder:text-slate-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <span className="text-xs font-mono-ui font-bold text-slate-400">
                    {filteredArticles.length} Articles
                  </span>
                  {loadingCount > 0 && (
                    <span className="flex items-center gap-1.5 text-xs font-mono-ui text-purple-400">
                      <Loader2 size={13} className="fg-spin" /> Fetching
                    </span>
                  )}
                </div>
              </div>

              {/* Mobile Filter Chips */}
              <div className="flex lg:hidden gap-2 overflow-x-auto fg-scroll pb-3 mb-3 -mx-1 px-1">
                <button
                  onClick={() => {
                    setActiveFeedId("all");
                    setShowBookmarksOnly(false);
                  }}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
                    activeFeedId === "all" && !showBookmarksOnly
                      ? "bg-purple-600 text-white"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  전체
                </button>
                <button
                  onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 ${
                    showBookmarksOnly ? "bg-pink-600 text-white" : "bg-slate-800 text-slate-300"
                  }`}
                >
                  <Bookmark size={12} className="fill-current" /> 북마크 ({bookmarks.length})
                </button>
              </div>

              {/* Empty state */}
              {filteredArticles.length === 0 && loadingCount === 0 && (
                <div className="rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center py-20 px-6 bg-slate-900/30">
                  <Rss size={36} className="text-purple-400/40 mb-3" />
                  <p className="font-bold text-slate-200">기사를 찾지 못했습니다</p>
                  <p className="text-xs mt-1 text-slate-400">
                    {searchQuery ? "다른 검색어를 입력해 보세요." : "상단의 '피드 추가' 버튼으로 새 RSS를 등록해 보세요."}
                  </p>
                </div>
              )}

              {/* Articles Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {filteredArticles.map((a) => {
                  const f = feedById(a.feedId);
                  const isSelected = selected?.id === a.id;
                  const isBookmarked = bookmarks.includes(a.id);

                  return (
                    <div
                      key={a.id}
                      onClick={() => selectArticle(a)}
                      className={`fg-card cursor-pointer group text-left rounded-2xl overflow-hidden glass-panel flex flex-col relative transition-all duration-300 ${
                        isSelected ? "glass-panel-glow" : ""
                      }`}
                    >
                      <div className="relative w-full aspect-[16/10] bg-slate-900 overflow-hidden">
                        {a.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.image}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950/40 to-slate-900">
                            <Rss size={28} className="text-purple-400/40" />
                          </div>
                        )}

                        {/* Feed Badge */}
                        <span
                          className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono-ui flex items-center gap-1.5 bg-slate-950/80 backdrop-blur border border-white/10 shadow-lg"
                          style={{ color: f?.color || "#8B5CF6" }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: f?.color }} />
                          {f?.name}
                        </span>

                        {/* Bookmark Button */}
                        <button
                          onClick={(e) => toggleBookmark(a.id, e)}
                          aria-label="북마크"
                          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-950/80 backdrop-blur border border-white/10 flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all"
                        >
                          <Bookmark
                            size={14}
                            className={isBookmarked ? "fill-pink-500 text-pink-500" : "text-slate-400"}
                          />
                        </button>
                      </div>

                      <div className="p-4.5 flex flex-col gap-2 flex-1">
                        <h3 className="text-xs sm:text-sm font-bold leading-snug line-clamp-2 text-slate-100 group-hover:text-purple-300 transition-colors">
                          {a.title}
                        </h3>
                        {a.description && (
                          <p className="text-xs line-clamp-2 text-slate-400 leading-normal font-medium">
                            {a.description}
                          </p>
                        )}
                        <div className="mt-auto pt-3 flex items-center justify-between text-[11px] font-mono-ui text-slate-400">
                          <span>{timeAgo(a.pubDate)}</span>
                          <span className="text-[10px] text-purple-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            카드 편집 ▶
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>

        {/* Right Sidebar: Instagram Preview & AI Studio */}
        <aside className="px-6 sm:px-8 py-7 lg:border-l lg:border-white/5 lg:sticky lg:top-[73px] lg:h-[calc(100vh-73px)] overflow-y-auto fg-scroll bg-slate-950/60">
          <div className="flex items-center justify-between mb-4">
            <div className="font-mono-ui text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
              <Camera size={15} className="text-purple-400" />
              인스타그램 카드 & AI Studio
            </div>
            {igConnected !== null && (
              <span className={`flex items-center gap-1.5 text-[10px] font-mono-ui font-bold px-2.5 py-1 rounded-full border ${
                igConnected
                  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                  : "text-red-400 bg-red-500/10 border-red-500/30"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${igConnected ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-red-400"}`} />
                {igConnected ? (igUsername ? `@${igUsername}` : "연결됨") : "미연결"}
              </span>
            )}
          </div>

          {!selected ? (
            <div className="rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center py-20 px-5 glass-panel">
              <Camera size={32} className="text-purple-400/40 mb-3" />
              <p className="text-xs font-bold text-slate-200">기사를 선택하세요</p>
              <p className="text-[11px] mt-1 text-slate-400 leading-normal">
                왼쪽 목록에서 기사를 클릭하면 실시간 카드뉴스 제작 템플릿과 AI 캡션을 설정할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="fg-pop space-y-5">
              {/* Instagram Card Preview Frame */}
              <div
                className="rounded-[2.2rem] p-3 mx-auto bg-slate-950 border border-white/15 relative shadow-2xl"
                style={{ maxWidth: 330 }}
              >
                <div className="rounded-[1.7rem] overflow-hidden bg-slate-900 border border-white/10">
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/5 bg-slate-950">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full shrink-0 shadow-md"
                        style={{ background: "linear-gradient(135deg, #EC4899, #8B5CF6, #06B6D4)" }}
                      />
                      <span className="text-xs font-bold text-slate-200">
                        {feedById(selected.feedId)?.name?.toLowerCase().replace(/\s+/g, "") || "feed4grams"}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono-ui px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                      {cardTheme.toUpperCase()}
                    </span>
                  </div>

                  {/* Card Image Box */}
                  <div className="w-full aspect-square bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    {selected.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full p-6 flex flex-col items-center justify-center text-center bg-gradient-to-br from-slate-950 via-purple-950/60 to-slate-950 text-white">
                        <span className="font-display text-lg font-bold leading-snug line-clamp-4">
                          {selected.title}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between px-3.5 pt-3">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-slate-400" />
                      <div className="w-4 h-4 rounded-full border-2 border-slate-400" />
                      <div className="w-4 h-4 rounded-full border-2 border-slate-400" />
                    </div>
                    <button
                      onClick={() => setShowCardCanvasModal(true)}
                      className="text-[10px] font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                    >
                      <Palette size={12} /> 고화질 템플릿 변환
                    </button>
                  </div>

                  <div className="px-3.5 py-3 text-[11px] leading-relaxed text-slate-200 font-medium">
                    <span className="font-bold mr-1 text-purple-300">
                      {feedById(selected.feedId)?.name?.toLowerCase().replace(/\s+/g, "") || "feed4grams"}
                    </span>
                    {caption ? (
                      <span className="whitespace-pre-wrap text-slate-300">{caption}</span>
                    ) : (
                      <span className="text-slate-400 font-mono-ui text-[10px]">
                        아래 톤앤매너를 선택하여 AI 캡션을 생성해 보세요 ✨
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Multi-Tone Captions Studio */}
              <div className="p-4 rounded-2xl glass-panel border border-white/10 space-y-3 shadow-xl">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <Sparkles size={15} className="text-purple-400" />
                  AI 캡션 톤앤매너 선택
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "professional", label: "💼 비즈니스 뉴스" },
                    { key: "trendy", label: "🔥 트렌디 숏폼" },
                    { key: "insight", label: "💡 3줄 인사이트" },
                    { key: "cta", label: "🏷️ 해시태그 & CTA" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => generateCaption(t.key as CaptionTone)}
                      disabled={generating}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all text-left flex items-center gap-1.5 ${
                        captionTone === t.key
                          ? "border-purple-500 bg-purple-500/20 text-purple-300 shadow-md shadow-purple-500/10"
                          : "border-white/5 bg-slate-900/60 text-slate-400 hover:border-white/15 hover:text-white"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => generateCaption(captionTone)}
                  disabled={generating}
                  className="w-full mt-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold disabled:opacity-60 bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  {generating ? <Loader2 size={14} className="fg-spin" /> : <Sparkles size={14} />}
                  {generating ? "캡션 작성 중..." : "AI 캡션 다시 생성"}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => setShowCardCanvasModal(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-xs font-bold bg-slate-900 border border-purple-500/40 text-purple-300 hover:bg-purple-950/40 hover:border-purple-500 transition-all shadow-lg"
                >
                  <Palette size={15} /> 카드뉴스 템플릿 제작 & PNG 다운로드
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={handlePost}
                    disabled={posting}
                    className="flex items-center justify-center gap-2 rounded-full py-3 text-xs font-bold disabled:opacity-70 text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background:
                        postMode === "posted"
                          ? "#10B981"
                          : "linear-gradient(135deg, #EC4899, #8B5CF6)",
                    }}
                  >
                    {posting ? (
                      <Loader2 size={14} className="fg-spin" />
                    ) : postMode === "posted" ? (
                      <Check size={14} />
                    ) : (
                      <Send size={14} />
                    )}
                    {posting ? "게시 중..." : postMode === "posted" ? "게시 완료" : "인스타 포스팅"}
                  </button>

                  <button
                    onClick={() => setShowScheduleModal(true)}
                    className="flex items-center justify-center gap-2 rounded-full py-3 text-xs font-bold border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800 transition-all shadow-md"
                  >
                    <Calendar size={14} /> 포스팅 예약
                  </button>
                </div>

                {postResultMsg && (
                  <p
                    className="text-[11px] leading-relaxed px-1 text-center font-medium"
                    style={{ color: postMode === "error" ? "#F43F5E" : "#94A3B8" }}
                  >
                    {postResultMsg}
                  </p>
                )}

                <a
                  href={selected.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs font-bold py-1 text-slate-400 hover:text-white transition-colors"
                >
                  원문 기사 전문 확인 <ExternalLink size={13} />
                </a>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* 🎨 Card News Canvas Generator Modal */}
      {showCardCanvasModal && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
          onClick={() => setShowCardCanvasModal(false)}
        >
          <div
            className="fg-pop w-full max-w-xl rounded-3xl glass-panel-glow p-7 shadow-2xl space-y-5 overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-white flex items-center gap-2.5">
                  <Palette size={20} className="text-purple-400" />
                  카드뉴스 고화질 이미지 Studio
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">원하는 템플릿 테마와 인스타그램 비율을 지정하세요.</p>
              </div>
              <button onClick={() => setShowCardCanvasModal(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Template controls */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-300 mb-2 block">디자인 템플릿 테마</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "dark", label: "🌙 모던 짙은" },
                    { key: "cream", label: "📜 크림 매거진" },
                    { key: "neon", label: "⚡ 네온 팝" },
                    { key: "pastel", label: "🌸 파스텔 감성" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setCardTheme(t.key as CardTemplateTheme)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all ${
                        cardTheme === t.key
                          ? "border-purple-500 bg-purple-500/20 text-purple-300 shadow-md"
                          : "border-white/10 bg-slate-900/60 text-slate-400 hover:text-white"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 mb-2 block">인스타그램 비율</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "1:1", label: "정사각형 1:1" },
                    { key: "4:5", label: "피드 세로 4:5" },
                  ].map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setCardAspectRatio(r.key as CardAspectRatio)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all ${
                        cardAspectRatio === r.key
                          ? "border-purple-500 bg-purple-500/20 text-purple-300 shadow-md"
                          : "border-white/10 bg-slate-900/60 text-slate-400 hover:text-white"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Canvas Preview */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-950 rounded-2xl border border-white/10">
              <canvas
                ref={canvasRef}
                className="max-w-full h-auto rounded-xl shadow-2xl border border-white/10"
                style={{ maxHeight: "380px" }}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={downloadCanvasImage}
                className="flex-1 py-3.5 rounded-full text-xs font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 text-white flex items-center justify-center gap-2 shadow-xl shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Download size={16} /> 카드뉴스 PNG 고화질 다운로드
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📅 Post Scheduler Modal */}
      {showScheduleModal && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-950/80 backdrop-blur-md"
          onClick={() => setShowScheduleModal(false)}
        >
          <div className="fg-pop w-full max-w-sm rounded-3xl glass-panel-glow p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Calendar size={18} className="text-purple-400" /> 포스팅 일정 예약
              </h2>
              <button onClick={() => setShowScheduleModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-normal">
              대상 기사: <span className="font-bold text-slate-200">{selected.title}</span>
            </p>

            <label className="text-xs font-bold text-slate-300 block mb-1">발행 일시 지정</label>
            <input
              type="datetime-local"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full mt-1 mb-5 rounded-xl px-3.5 py-2.5 text-xs font-mono-ui bg-slate-900 border border-white/10 text-white font-semibold focus:outline-none focus:border-purple-500"
            />

            <button
              onClick={handleAddSchedule}
              disabled={!scheduleTime}
              className="w-full rounded-full py-3 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg"
            >
              <Calendar size={15} /> 예약 등록하기
            </button>
          </div>
        </div>
      )}

      {/* RSS Add Modal */}
      {showAddFeed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-950/80 backdrop-blur-md"
          onClick={() => setShowAddFeed(false)}
        >
          <div className="fg-pop w-full max-w-sm rounded-3xl glass-panel-glow p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Rss size={18} className="text-purple-400" /> RSS 피드 구독 추가
              </h2>
              <button onClick={() => setShowAddFeed(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <label className="text-xs font-bold text-slate-300 block mb-1">피드 URL 주소</label>
            <input
              value={feedInput}
              onChange={(e) => setFeedInput(e.target.value)}
              placeholder="https://example.com/rss.xml"
              className="w-full mt-1 mb-3.5 rounded-xl px-3.5 py-2.5 text-xs font-mono-ui bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-purple-500"
            />
            <label className="text-xs font-bold text-slate-300 block mb-1">커스텀 이름 (선택)</label>
            <input
              value={feedNameInput}
              onChange={(e) => setFeedNameInput(e.target.value)}
              placeholder="예: IT 테크 매거진"
              className="w-full mt-1 mb-2 rounded-xl px-3.5 py-2.5 text-xs bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-purple-500"
              onKeyDown={(e) => e.key === "Enter" && handleAddFeed()}
            />
            {addError && <p className="text-xs mt-1 mb-2 text-red-400 font-medium">{addError}</p>}
            <button
              onClick={handleAddFeed}
              className="w-full mt-4 rounded-full py-3 text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg"
            >
              <Plus size={15} /> 구독 등록
            </button>
          </div>
        </div>
      )}

      {/* Info Modal */}
      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-950/80 backdrop-blur-md"
          onClick={() => setShowInfo(false)}
        >
          <div className="fg-pop w-full max-w-md rounded-3xl glass-panel-glow p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
              <h2 className="font-display text-lg font-bold text-white">인스타그램 연동 & 설정 안내</h2>
              <button onClick={() => setShowInfo(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <ol className="text-xs space-y-3 text-slate-300 leading-relaxed font-medium">
              <li className="flex gap-2">
                <ChevronRight size={15} className="shrink-0 mt-0.5 text-purple-400" />
                인스타그램 계정을 비즈니스 계정으로 전환 후 Facebook 페이지와 연동합니다.
              </li>
              <li className="flex gap-2">
                <ChevronRight size={15} className="shrink-0 mt-0.5 text-purple-400" />
                Meta for Developers에서 Instagram Graph API 권한 토큰을 발급받습니다.
              </li>
              <li className="flex gap-2">
                <ChevronRight size={15} className="shrink-0 mt-0.5 text-purple-400" />
                `.env.local` 파일에 INSTAGRAM_ACCESS_TOKEN 및 INSTAGRAM_BUSINESS_ID를 지정합니다.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 rounded-full px-6 py-3 text-xs font-bold fg-pop flex items-center gap-2.5 bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 text-white shadow-2xl shadow-purple-500/40 border border-white/20">
          <Check size={16} /> {toast}
        </div>
      )}
    </div>
  );
}
