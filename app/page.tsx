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

const FEED_COLORS = ["#FF6B6B", "#7C5CFF", "#4CC9F0", "#FFB84C", "#FF6FB5", "#38D9A9"];
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
      return "응답 시간이 초과됐어요";
    case "EMPTY_FEED":
      return "기사를 찾지 못했어요";
    case "INVALID_URL":
      return "올바르지 않은 주소예요";
    case "FETCH_FAILED":
      return "피드를 가져오지 못했어요";
    default:
      return "불러오기에 실패했어요";
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
  const [postMode, setPostMode] = useState<"idle" | "preview" | "posted" | "error">("idle");
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [activeTab, setActiveTab] = useState<"editor" | "scheduler">("editor");

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
      setToast(exists ? "북마크에서 제거되었습니다." : "기사가 북마크에 저장되었습니다! 📌");
      setTimeout(() => setToast(null), 2000);
      return next;
    });
  };

  const handleAddFeed = () => {
    const url = feedInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setAddError("http:// 또는 https:// 로 시작하는 주소를 입력해 주세요");
      return;
    }
    if (feeds.some((f) => f.url === url)) {
      setAddError("이미 등록된 피드예요");
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
        setCaption(data?.message || "캡션 생성에 실패했어요.");
        return;
      }
      setCaption(data.caption || "");
    } catch {
      setCaption("캡션 생성 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
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
      sourceName: f?.name || "Feed4Grams",
      imageUrl: selected.image,
      theme: cardTheme,
      aspectRatio: cardAspectRatio,
    });
  }, [selected, cardTheme, cardAspectRatio, feeds]);

  useEffect(() => {
    if (showCardCanvasModal) {
      setTimeout(() => handleRenderCanvas(), 50);
    }
  }, [showCardCanvasModal, handleRenderCanvas]);

  const downloadCanvasImage = () => {
    if (!canvasRef.current || !selected) return;
    const link = document.createElement("a");
    link.download = `cardnews-${selected.id.slice(0, 6)}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    setToast("카드뉴스 이미지가 다운로드되었습니다! 🎨");
    setTimeout(() => setToast(null), 2500);
  };

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
      if (!res.ok) {
        setPostMode("error");
        setPostResultMsg(data?.message || "게시에 실패했어요.");
      } else if (data.mode === "preview") {
        setPostMode("preview");
        setPostResultMsg(data.message);
      } else {
        setPostMode("posted");
        setPostResultMsg(data.permalink ? `게시 완료: ${data.permalink}` : "게시가 완료됐어요.");
        setToast("인스타그램에 성공적으로 포스팅되었습니다! 🚀");
        setTimeout(() => setToast(null), 2600);
      }
    } catch {
      setPostMode("error");
      setPostResultMsg("네트워크 오류로 게시하지 못했어요.");
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
    setToast("포스팅 예약 일정이 추가되었습니다! 📅");
    setTimeout(() => setToast(null), 2500);
  };

  const removeSchedule = (id: string) => {
    setScheduledPosts((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="w-full min-h-screen bg-[var(--color-bg)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-5 sm:px-8 py-3.5 border-b bg-[var(--color-bg)]/90 backdrop-blur border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-[var(--color-ink)] shadow-md">
            <Rss size={20} color="#C6F135" strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-2xl text-[var(--color-ink)] leading-tight">피드그램</span>
              <span className="px-2 py-0.5 rounded-full font-mono-ui text-[10px] font-bold bg-[#E7E2FF] text-[var(--color-primary)]">
                Studio v2.0
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-muted)] hidden sm:block">
              RSS 큐레이션 · AI 카드뉴스 & 캡션 포스팅 오토메이션
            </p>
          </div>
        </div>

        {/* Tab Navigation & Add Feed */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex bg-[var(--color-chip)] p-1 rounded-full border border-[var(--color-border)]">
            <button
              onClick={() => setActiveTab("editor")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeTab === "editor"
                  ? "bg-white text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              콘텐츠 큐레이터
            </button>
            <button
              onClick={() => setActiveTab("scheduler")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "scheduler"
                  ? "bg-white text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              <Calendar size={13} />
              발행 일정
              {scheduledPosts.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-white text-[9px] flex items-center justify-center">
                  {scheduledPosts.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowAddFeed(true)}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-bold bg-[var(--color-primary)] text-white shadow-sm hover:brightness-105 transition-all"
          >
            <Plus size={16} /> 피드 추가
          </button>
          <button
            onClick={() => setShowInfo(true)}
            aria-label="설정 및 안내"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--color-chip)] text-[var(--color-ink)] hover:bg-[#E2DCFF] transition-all"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-[240px_1fr_380px] gap-0 min-h-[calc(100vh-65px)]">
        {/* Left Sidebar: RSS Feeds & Quick Categories */}
        <aside className="hidden lg:block px-5 py-6 border-r border-[var(--color-border)] bg-white/40">
          <div className="space-y-6">
            {/* Quick Filters */}
            <div>
              <div className="font-mono-ui text-[11px] uppercase tracking-wider mb-2.5 text-[var(--color-muted)] font-semibold">
                큐레이션 뷰
              </div>
              <nav className="flex flex-col gap-1">
                <button
                  onClick={() => {
                    setActiveFeedId("all");
                    setShowBookmarksOnly(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-left transition-all ${
                    activeFeedId === "all" && !showBookmarksOnly
                      ? "bg-[var(--color-ink)] text-white shadow-sm"
                      : "text-[var(--color-ink)] hover:bg-[var(--color-chip)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Layers size={14} /> 전체 기사
                  </span>
                  <span className="font-mono-ui text-[11px] opacity-80">{articles.length}</span>
                </button>
                <button
                  onClick={() => {
                    setShowBookmarksOnly(true);
                    setActiveFeedId("all");
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-left transition-all ${
                    showBookmarksOnly
                      ? "bg-[var(--color-ink)] text-white shadow-sm"
                      : "text-[var(--color-ink)] hover:bg-[var(--color-chip)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Bookmark size={14} className="fill-current text-[#FF6FB5]" /> 북마크함
                  </span>
                  <span className="font-mono-ui text-[11px] opacity-80">{bookmarks.length}</span>
                </button>
              </nav>
            </div>

            {/* RSS Feed Subscriptions */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-mono-ui text-[11px] uppercase tracking-wider text-[var(--color-muted)] font-semibold">
                  구독 RSS 피드 · {feeds.length}
                </span>
              </div>
              <nav className="flex flex-col gap-1 max-h-[calc(100vh-320px)] overflow-y-auto fg-scroll pr-1">
                {feeds.map((f) => (
                  <div key={f.id} className="group relative">
                    <button
                      onClick={() => {
                        setActiveFeedId(f.id);
                        setShowBookmarksOnly(false);
                      }}
                      className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-left pr-7 transition-all ${
                        activeFeedId === f.id && !showBookmarksOnly
                          ? "bg-[var(--color-ink)] text-white shadow-sm"
                          : "text-[var(--color-ink)] hover:bg-[var(--color-chip)]"
                      }`}
                    >
                      {f.loading ? (
                        <Loader2 size={12} className="fg-spin shrink-0" style={{ color: f.color }} />
                      ) : (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: f.color, boxShadow: `0 0 0 3px ${f.color}22` }}
                        />
                      )}
                      <span className="truncate flex-1">{f.name}</span>
                    </button>
                    <button
                      onClick={() => removeFeed(f.id)}
                      aria-label={`${f.name} 피드 삭제`}
                      className={`absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                        activeFeedId === f.id ? "text-white" : "text-[var(--color-muted)] hover:text-red-500"
                      }`}
                    >
                      <X size={13} />
                    </button>
                    {f.error && (
                      <div className="flex items-center justify-between pl-3 pr-1 mt-0.5">
                        <span className="text-[10px] text-[var(--color-coral)]">{f.errorMsg || "실패"}</span>
                        <button
                          onClick={() => loadFeed(f)}
                          className="text-[10px] font-semibold underline text-[var(--color-primary)]"
                        >
                          재시도
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </nav>
              {feeds.length === 0 && (
                <p className="text-xs mt-3 text-[var(--color-muted)]">
                  등록된 피드가 없어요. 상단의 &apos;피드 추가&apos;로 시작하세요.
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* Center Panel: Articles Grid / Scheduler View */}
        <main className="px-5 sm:px-8 py-6">
          {activeTab === "scheduler" ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-xl text-[var(--color-ink)] flex items-center gap-2">
                    <Calendar size={20} className="text-[var(--color-primary)]" />
                    인스타그램 포스팅 예약 대기열
                  </h1>
                  <p className="text-xs text-[var(--color-muted)] mt-1">
                    예약된 포스팅 카드와 콘텐츠 일정을 한눈에 관리하세요.
                  </p>
                </div>
              </div>

              {scheduledPosts.length === 0 ? (
                <div className="rounded-3xl border-2 border-dashed border-[#DCD3FF] flex flex-col items-center justify-center text-center py-16 px-6 bg-white/50">
                  <Calendar size={32} color="#B8A6FF" />
                  <p className="mt-3 font-semibold text-[var(--color-ink)]">예약된 포스팅이 없습니다</p>
                  <p className="text-xs mt-1 text-[var(--color-muted)]">
                    우측 인스타그램 미리보기에서 &apos;포스팅 예약&apos; 버튼을 통해 일정을 등록해 보세요.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {scheduledPosts.map((sp) => (
                    <div
                      key={sp.id}
                      className="p-4 rounded-2xl bg-white border border-[var(--color-border)] shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs font-mono-ui mb-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F0ECFF] text-[var(--color-primary)] font-bold">
                            {sp.feedName}
                          </span>
                          <span className="text-[var(--color-muted)] flex items-center gap-1">
                            <Clock size={12} /> {sp.scheduledTime}
                          </span>
                        </div>
                        <h4 className="font-bold text-sm text-[var(--color-ink)] line-clamp-2">{sp.articleTitle}</h4>
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--color-border)]">
                        <span className="text-[11px] font-semibold text-[#38D9A9] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#38D9A9]" /> 예약 완료
                        </span>
                        <button
                          onClick={() => removeSchedule(sp.id)}
                          className="text-xs text-[var(--color-muted)] hover:text-red-500 flex items-center gap-1"
                        >
                          <Trash2 size={13} /> 취소
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Search Bar & Filter Header */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
                <div className="relative flex-1 max-w-md">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="기사 제목 또는 내용 실시간 검색..."
                    className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold rounded-2xl bg-white border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] shadow-sm transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <span className="text-xs font-mono-ui font-bold text-[var(--color-muted)]">
                    {filteredArticles.length}개 기사
                  </span>
                  {loadingCount > 0 && (
                    <span className="flex items-center gap-1.5 text-xs font-mono-ui text-[var(--color-primary)]">
                      <Loader2 size={13} className="fg-spin" /> 불러오는 중
                    </span>
                  )}
                </div>
              </div>

              {/* Mobile Feed Horizontal Filter Chips */}
              <div className="flex lg:hidden gap-2 overflow-x-auto fg-scroll pb-3 mb-2 -mx-1 px-1">
                <button
                  onClick={() => {
                    setActiveFeedId("all");
                    setShowBookmarksOnly(false);
                  }}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                    activeFeedId === "all" && !showBookmarksOnly
                      ? "bg-[var(--color-ink)] text-white"
                      : "bg-[var(--color-chip)] text-[var(--color-ink)]"
                  }`}
                >
                  전체
                </button>
                <button
                  onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-1 ${
                    showBookmarksOnly
                      ? "bg-[var(--color-ink)] text-white"
                      : "bg-[var(--color-chip)] text-[var(--color-ink)]"
                  }`}
                >
                  <Bookmark size={12} className="fill-current" /> 북마크 ({bookmarks.length})
                </button>
                {feeds.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setActiveFeedId(f.id);
                      setShowBookmarksOnly(false);
                    }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 ${
                      activeFeedId === f.id && !showBookmarksOnly
                        ? "bg-[var(--color-ink)] text-white"
                        : "bg-[var(--color-chip)] text-[var(--color-ink)]"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: f.color }} />
                    {f.name}
                  </button>
                ))}
              </div>

              {/* Empty State */}
              {filteredArticles.length === 0 && loadingCount === 0 && (
                <div className="rounded-3xl border-2 border-dashed border-[#DCD3FF] flex flex-col items-center justify-center text-center py-16 px-6 bg-white/40">
                  <Rss size={32} color="#B8A6FF" />
                  <p className="mt-3 font-bold text-[var(--color-ink)]">조건에 해당하는 기사가 없습니다</p>
                  <p className="text-xs mt-1 text-[var(--color-muted)]">
                    {searchQuery ? "다른 검색어로 입력해 보세요." : "새로운 RSS 주소를 등록해 주세요."}
                  </p>
                </div>
              )}

              {/* Articles Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredArticles.map((a) => {
                  const f = feedById(a.feedId);
                  const isSelected = selected?.id === a.id;
                  const isBookmarked = bookmarks.includes(a.id);

                  return (
                    <div
                      key={a.id}
                      onClick={() => selectArticle(a)}
                      className="fg-card cursor-pointer group text-left rounded-2xl overflow-hidden bg-white flex flex-col relative transition-all duration-200 hover:-translate-y-1"
                      style={{
                        boxShadow: isSelected
                          ? "0 0 0 2.5px #7C5CFF, 0 10px 25px -5px rgba(124,92,255,0.2)"
                          : "0 1px 3px rgba(28,23,48,0.06)",
                      }}
                    >
                      <div className="relative w-full aspect-[16/10] bg-[var(--color-chip)] overflow-hidden">
                        {a.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.image}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#F5F2FF] to-[#EAE4FF]">
                            <Rss size={24} color="#B8A6FF" />
                          </div>
                        )}

                        {/* Feed Badge */}
                        <span
                          className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono-ui flex items-center gap-1.5 bg-white/90 backdrop-blur shadow-sm"
                          style={{ color: f?.color || "#1C1730" }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: f?.color }} />
                          {f?.name}
                        </span>

                        {/* Bookmark Button */}
                        <button
                          onClick={(e) => toggleBookmark(a.id, e)}
                          aria-label="북마크"
                          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm hover:scale-110 transition-all"
                        >
                          <Bookmark
                            size={14}
                            className={isBookmarked ? "fill-[#FF6FB5] text-[#FF6FB5]" : "text-[var(--color-muted)]"}
                          />
                        </button>
                      </div>

                      <div className="p-4 flex flex-col gap-1.5 flex-1">
                        <h3 className="text-xs sm:text-sm font-bold leading-snug line-clamp-2 text-[var(--color-ink)] group-hover:text-[var(--color-primary)] transition-colors">
                          {a.title}
                        </h3>
                        {a.description && (
                          <p className="text-xs line-clamp-2 text-[var(--color-muted)] leading-normal">{a.description}</p>
                        )}
                        <div className="mt-auto pt-2 flex items-center justify-between text-[11px] font-mono-ui text-[var(--color-muted-2)]">
                          <span>{timeAgo(a.pubDate)}</span>
                          <span className="text-[10px] text-[var(--color-primary)] opacity-0 group-hover:opacity-100 font-bold transition-opacity">
                            카드뉴스 편집 ▶
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

        {/* Right Sidebar: Instagram Preview & AI Caption Studio */}
        <aside className="px-5 sm:px-8 py-6 lg:border-l lg:sticky lg:top-[65px] lg:h-[calc(100vh-65px)] overflow-y-auto fg-scroll border-[var(--color-border)] bg-white/60">
          <div className="flex items-center justify-between mb-3">
            <div className="font-mono-ui text-[11px] uppercase tracking-wider text-[var(--color-muted)] font-bold flex items-center gap-1.5">
              <Camera size={14} className="text-[var(--color-primary)]" />
              인스타그램 카드 & AI Studio
            </div>
          </div>

          {!selected ? (
            <div className="rounded-3xl border-2 border-dashed border-[#DCD3FF] flex flex-col items-center justify-center text-center py-16 px-4 bg-white/40">
              <Camera size={28} color="#B8A6FF" />
              <p className="text-xs font-bold mt-3 text-[var(--color-ink)]">기사를 선택해 주세요</p>
              <p className="text-[11px] mt-1 text-[var(--color-muted)]">
                기사 카드를 클릭하면 실시간 인스타그램 카드뉴스 템플릿과 AI 캡션 조율이 가능합니다.
              </p>
            </div>
          ) : (
            <div className="fg-pop space-y-4">
              {/* Instagram Card Preview Container */}
              <div
                className="rounded-[2rem] p-3 mx-auto bg-[var(--color-ink)] relative"
                style={{ maxWidth: 320, boxShadow: "0 20px 40px -16px rgba(28,23,48,0.35)" }}
              >
                <div className="rounded-[1.6rem] overflow-hidden bg-white">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full shrink-0"
                        style={{ background: "linear-gradient(135deg, #FF6B6B, #7C5CFF, #4CC9F0)" }}
                      />
                      <span className="text-xs font-bold text-[var(--color-ink)]">
                        {feedById(selected.feedId)?.name?.toLowerCase().replace(/\s+/g, "") || "myfeed"}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono-ui px-2 py-0.5 rounded-full bg-gray-100 font-bold text-gray-600">
                      {cardTheme.toUpperCase()}
                    </span>
                  </div>

                  {/* Dynamic Image Area */}
                  <div className="w-full aspect-square bg-[var(--color-chip)] relative overflow-hidden flex items-center justify-center">
                    {selected.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full p-5 flex flex-col items-center justify-center text-center bg-gradient-to-br from-[#1C1730] to-[#342A5C] text-white">
                        <span className="font-display text-base leading-tight font-bold line-clamp-4">
                          {selected.title}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between px-3 pt-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-[var(--color-ink)]" />
                      <div className="w-4 h-4 rounded-full border-2 border-[var(--color-ink)]" />
                      <div className="w-4 h-4 rounded-full border-2 border-[var(--color-ink)]" />
                    </div>
                    <button
                      onClick={() => setShowCardCanvasModal(true)}
                      className="text-[10px] font-bold text-[var(--color-primary)] flex items-center gap-1 hover:underline"
                    >
                      <Palette size={12} /> 카드 고화질 변환
                    </button>
                  </div>

                  <div className="px-3 py-2.5 text-[11px] leading-relaxed text-[var(--color-ink)]">
                    <span className="font-bold mr-1">
                      {feedById(selected.feedId)?.name?.toLowerCase().replace(/\s+/g, "") || "myfeed"}
                    </span>
                    {caption ? (
                      <span className="whitespace-pre-wrap">{caption}</span>
                    ) : (
                      <span className="text-[var(--color-muted-2)] font-mono-ui">
                        아래 톤앤매너 버튼을 눌러 AI 캡션을 생성해 보세요 ✨
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Multi-Tone Selection */}
              <div className="p-3.5 rounded-2xl bg-white border border-[var(--color-border)] shadow-sm space-y-2.5">
                <label className="text-xs font-bold text-[var(--color-ink)] flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[var(--color-primary)]" />
                  AI 캡션 톤앤매너 선택
                </label>

                <div className="grid grid-cols-2 gap-1.5">
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
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all text-left flex items-center gap-1 ${
                        captionTone === t.key
                          ? "border-[var(--color-primary)] bg-[#F5F2FF] text-[var(--color-primary)] shadow-sm"
                          : "border-gray-200 hover:border-gray-300 text-[var(--color-ink)]"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => generateCaption(captionTone)}
                  disabled={generating}
                  className="w-full mt-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold disabled:opacity-60 bg-[var(--color-primary)] text-white shadow-sm hover:brightness-105"
                >
                  {generating ? <Loader2 size={13} className="fg-spin" /> : <Sparkles size={13} />}
                  {generating ? "캡션 생성 중..." : "AI 캡션 다시 생성"}
                </button>
              </div>

              {/* Action Buttons: Card News Canvas / Post / Schedule */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowCardCanvasModal(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-xs font-bold bg-[#EFEAFF] text-[var(--color-primary)] hover:bg-[#E5DDFF] transition-all"
                >
                  <Palette size={14} /> 카드뉴스 템플릿 제작 & PNG 다운로드
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handlePost}
                    disabled={posting}
                    className="flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold disabled:opacity-70 text-white shadow-sm"
                    style={{ background: postMode === "posted" ? "#38D9A9" : "#1C1730" }}
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
                    className="flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold border border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:bg-gray-50 shadow-sm"
                  >
                    <Calendar size={14} /> 포스팅 예약
                  </button>
                </div>

                {postResultMsg && (
                  <p
                    className="text-[11px] leading-relaxed px-1 text-center font-medium"
                    style={{ color: postMode === "error" ? "#FF6B6B" : "#8A80B0" }}
                  >
                    {postResultMsg}
                  </p>
                )}

                <a
                  href={selected.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs font-bold py-1 text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  원문 기사 전문 확인 <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* 🎨 Card News Canvas Generator Modal */}
      {showCardCanvasModal && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(18,19,26,0.65)] backdrop-blur-sm"
          onClick={() => setShowCardCanvasModal(false)}
        >
          <div
            className="fg-pop w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl space-y-4 overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="font-display text-lg text-[var(--color-ink)] flex items-center gap-2">
                  <Palette size={18} className="text-[var(--color-primary)]" />
                  인스타그램 고화질 카드뉴스 제작 Studio
                </h2>
                <p className="text-xs text-[var(--color-muted)]">템플릿 테마와 비율을 선택해 이미지로 바로 저장하세요.</p>
              </div>
              <button onClick={() => setShowCardCanvasModal(false)}>
                <X size={20} color="#8A80B0" />
              </button>
            </div>

            {/* Template controls */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--color-ink)] mb-1 block">디자인 템플릿 테마</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { key: "dark", label: "🌙 모던 짙은" },
                    { key: "cream", label: "📜 크림 매거진" },
                    { key: "neon", label: "⚡ 네온 팝" },
                    { key: "pastel", label: "🌸 파스텔 감성" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setCardTheme(t.key as CardTemplateTheme)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border ${
                        cardTheme === t.key
                          ? "border-[var(--color-primary)] bg-[#F5F2FF] text-[var(--color-primary)]"
                          : "border-gray-200 text-gray-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--color-ink)] mb-1 block">인스타그램 비율</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { key: "1:1", label: "정사각형 1:1" },
                    { key: "4:5", label: "피드 세로 4:5" },
                  ].map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setCardAspectRatio(r.key as CardAspectRatio)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border ${
                        cardAspectRatio === r.key
                          ? "border-[var(--color-primary)] bg-[#F5F2FF] text-[var(--color-primary)]"
                          : "border-gray-200 text-gray-700"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Canvas Rendering Preview Area */}
            <div className="flex flex-col items-center justify-center p-3 bg-gray-900 rounded-2xl">
              <canvas
                ref={canvasRef}
                className="max-w-full h-auto rounded-xl shadow-lg border border-gray-700"
                style={{ maxHeight: "400px" }}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={downloadCanvasImage}
                className="flex-1 py-3 rounded-full text-xs font-bold bg-[var(--color-primary)] text-white flex items-center justify-center gap-2 shadow-md hover:brightness-105"
              >
                <Download size={15} /> 카드뉴스 PNG 다운로드
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📅 Post Scheduler Modal */}
      {showScheduleModal && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[rgba(28,23,48,0.45)] backdrop-blur-sm"
          onClick={() => setShowScheduleModal(false)}
        >
          <div className="fg-pop w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg text-[var(--color-ink)] flex items-center gap-2">
                <Calendar size={18} className="text-[var(--color-primary)]" /> 포스팅 일정 예약
              </h2>
              <button onClick={() => setShowScheduleModal(false)}>
                <X size={18} color="#8A80B0" />
              </button>
            </div>

            <p className="text-xs text-[var(--color-muted)] mb-3 leading-normal">
              선택한 기사: <span className="font-bold text-[var(--color-ink)]">{selected.title}</span>
            </p>

            <label className="text-xs font-bold text-[var(--color-ink)]">발행 일시 선택</label>
            <input
              type="datetime-local"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full mt-1.5 mb-4 rounded-xl px-3.5 py-2.5 text-xs font-mono-ui bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)] font-semibold"
            />

            <button
              onClick={handleAddSchedule}
              disabled={!scheduleTime}
              className="w-full rounded-full py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 bg-[var(--color-primary)] text-white shadow-sm"
            >
              <Calendar size={15} /> 예약 대기열 추가
            </button>
          </div>
        </div>
      )}

      {/* RSS Add Modal */}
      {showAddFeed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[rgba(28,23,48,0.45)] backdrop-blur-sm"
          onClick={() => setShowAddFeed(false)}
        >
          <div className="fg-pop w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg text-[var(--color-ink)]">RSS 피드 추가</h2>
              <button onClick={() => setShowAddFeed(false)} aria-label="닫기">
                <X size={18} color="#8A80B0" />
              </button>
            </div>
            <label className="text-xs font-bold text-[var(--color-ink)]">피드 URL 주소</label>
            <input
              value={feedInput}
              onChange={(e) => setFeedInput(e.target.value)}
              placeholder="https://example.com/rss.xml"
              className="w-full mt-1.5 mb-3 rounded-xl px-3.5 py-2.5 text-xs font-mono-ui bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
            />
            <label className="text-xs font-bold text-[var(--color-ink)]">표시 이름 (선택)</label>
            <input
              value={feedNameInput}
              onChange={(e) => setFeedNameInput(e.target.value)}
              placeholder="예: IT 테크 블로그"
              className="w-full mt-1.5 mb-1.5 rounded-xl px-3.5 py-2.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
              onKeyDown={(e) => e.key === "Enter" && handleAddFeed()}
            />
            {addError && <p className="text-xs mt-1 mb-1 text-[var(--color-coral)]">{addError}</p>}
            <button
              onClick={handleAddFeed}
              className="w-full mt-3 rounded-full py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-white shadow-sm"
            >
              <Plus size={15} /> 피드 구독 추가
            </button>
          </div>
        </div>
      )}

      {/* API Key Guide Modal */}
      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[rgba(28,23,48,0.45)] backdrop-blur-sm"
          onClick={() => setShowInfo(false)}
        >
          <div className="fg-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg text-[var(--color-ink)]">인스타그램 연동 & 설정 안내</h2>
              <button onClick={() => setShowInfo(false)} aria-label="닫기">
                <X size={18} color="#8A80B0" />
              </button>
            </div>
            <ol className="text-xs space-y-2.5 text-[var(--color-ink)] leading-relaxed font-medium">
              <li className="flex gap-2">
                <ChevronRight size={15} className="shrink-0 mt-0.5 text-[var(--color-primary)]" />
                인스타그램 비즈니스/크리에이터 계정 전환 후 Facebook 페이지와 연동합니다.
              </li>
              <li className="flex gap-2">
                <ChevronRight size={15} className="shrink-0 mt-0.5 text-[var(--color-primary)]" />
                Meta Developers에서 Instagram Graph API access_token 과 business_id를 발급받습니다.
              </li>
              <li className="flex gap-2">
                <ChevronRight size={15} className="shrink-0 mt-0.5 text-[var(--color-primary)]" />
                발급받은 키를 `.env.local`의 INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID로 설정합니다.
              </li>
              <li className="flex gap-2">
                <ChevronRight size={15} className="shrink-0 mt-0.5 text-[var(--color-primary)]" />
                Anthropic API 키(ANTHROPIC_API_KEY) 설정 시 AI multi-tone 캡션 생성이 자동 동작합니다.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full px-5 py-3 text-xs font-bold fg-pop flex items-center gap-2 bg-[var(--color-ink)] text-white shadow-xl">
          <Check size={16} color="#C6F135" /> {toast}
        </div>
      )}
    </div>
  );
}
