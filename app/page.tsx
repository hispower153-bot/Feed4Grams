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
} from "lucide-react";
import type { FeedArticle, SavedFeed } from "@/lib/types";

const FEED_COLORS = ["#FF6B6B", "#7C5CFF", "#4CC9F0", "#FFB84C", "#FF6FB5", "#38D9A9"];
const STORAGE_KEY = "feedgram:feeds:v1";

const SEED_FEEDS: Array<{ url: string; name: string }> = [
  { url: "https://technologyreview.com/feed/", name: "MIT" },
  { url: "https://www.yna.co.kr/rss/news.xml", name: "연합" },
  { url: "http://rss.kbench.com/news.xml", name: "케이벤치" },
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
  const [selected, setSelected] = useState<Article | null>(null);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [feedInput, setFeedInput] = useState("");
  const [feedNameInput, setFeedNameInput] = useState("");
  const [addError, setAddError] = useState("");
  const [caption, setCaption] = useState("");
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postResultMsg, setPostResultMsg] = useState<string | null>(null);
  const [postMode, setPostMode] = useState<"idle" | "preview" | "posted" | "error">("idle");
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

  useEffect(() => {
    let initial: Feed[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: SavedFeed[] = JSON.parse(raw);
        initial = saved.map((f) => ({ ...f }));
        colorIdx.current = saved.length;
      }
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
    // One-time hydration from localStorage on mount; intentionally setting state
    // synchronously here since this reads a browser-only API unavailable during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeeds(initial);
    initial.forEach((f) => loadFeed(f));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const visibleArticles = activeFeedId === "all" ? articles : articles.filter((a) => a.feedId === activeFeedId);
  const feedById = (id: string) => feeds.find((f) => f.id === id);

  const selectArticle = (article: Article) => {
    setSelected(article);
    setCaption("");
    setPostMode("idle");
    setPostResultMsg(null);
  };

  const generateCaption = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: selected.title, description: selected.description }),
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
        setToast("인스타그램에 게시됐어요");
        setTimeout(() => setToast(null), 2600);
      }
    } catch {
      setPostMode("error");
      setPostResultMsg("네트워크 오류로 게시하지 못했어요.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="w-full min-h-screen">
      <header className="sticky top-0 z-30 flex items-center justify-between px-5 sm:px-8 py-4 border-b bg-[var(--color-bg)]/90 backdrop-blur border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 bg-[var(--color-ink)]">
            <Rss size={17} color="#C6F135" strokeWidth={2.5} />
          </div>
          <span className="font-display text-2xl sm:text-3xl text-[var(--color-ink)]">피드그램</span>
          <span className="hidden sm:inline-block ml-1 px-2 py-0.5 rounded-full font-mono-ui text-[10px] bg-[var(--color-chip)] text-[var(--color-primary)]">
            RSS → IG
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddFeed(true)}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold bg-[var(--color-primary)] text-white"
          >
            <Plus size={16} /> 피드 추가
          </button>
          <button
            onClick={() => setShowInfo(true)}
            aria-label="설정 및 안내"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--color-chip)] text-[var(--color-ink)]"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[220px_1fr_360px] gap-0">
        <aside className="hidden lg:block px-5 py-6 border-r border-[var(--color-border)]">
          <div className="font-mono-ui text-[11px] uppercase tracking-wider mb-3 text-[var(--color-muted)]">
            내 피드 · {feeds.length}
          </div>
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => setActiveFeedId("all")}
              className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-left ${activeFeedId === "all" ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-ink)]"
                }`}
            >
              전체 보기
              <span className="font-mono-ui text-[11px] opacity-70">{articles.length}</span>
            </button>
            {feeds.map((f) => (
              <div key={f.id} className="group relative">
                <button
                  onClick={() => setActiveFeedId(f.id)}
                  className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-left pr-7 ${activeFeedId === f.id ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-ink)]"
                    }`}
                >
                  {f.loading ? (
                    <Loader2 size={10} className="fg-spin shrink-0" style={{ color: f.color }} />
                  ) : (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: f.color, boxShadow: `0 0 0 3px ${f.color}22` }}
                    />
                  )}
                  <span className="truncate flex-1">{f.name}</span>
                </button>
                <button
                  onClick={() => removeFeed(f.id)}
                  aria-label={`${f.name} 피드 삭제`}
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full flex items-center justify-center ${activeFeedId === f.id ? "text-white" : "text-[var(--color-muted)]"
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
                      다시 시도
                    </button>
                  </div>
                )}
              </div>
            ))}
          </nav>
          {feeds.length === 0 && (
            <p className="text-xs mt-3 text-[var(--color-muted)]">
              등록된 피드가 없어요. 상단의 &apos;피드 추가&apos;로 시작해 보세요.
            </p>
          )}
        </aside>

        <main className="px-5 sm:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-display text-xl text-[var(--color-ink)]">
              {activeFeedId === "all" ? "최신 기사" : feedById(activeFeedId)?.name || "기사"}
            </h1>
            {loadingCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-mono-ui text-[var(--color-muted)]">
                <Loader2 size={13} className="fg-spin" /> 불러오는 중
              </span>
            )}
          </div>

          <div className="flex lg:hidden gap-2 overflow-x-auto fg-scroll pb-3 mb-1 -mx-1 px-1">
            <button
              onClick={() => setActiveFeedId("all")}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${activeFeedId === "all" ? "bg-[var(--color-ink)] text-white" : "bg-[var(--color-chip)] text-[var(--color-ink)]"
                }`}
            >
              전체
            </button>
            {feeds.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFeedId(f.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${activeFeedId === f.id ? "bg-[var(--color-ink)] text-white" : "bg-[var(--color-chip)] text-[var(--color-ink)]"
                  }`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: f.color }} />
                {f.name}
              </button>
            ))}
          </div>

          {visibleArticles.length === 0 && loadingCount === 0 && (
            <div className="rounded-3xl border-2 border-dashed border-[#DCD3FF] flex flex-col items-center justify-center text-center py-16 px-6">
              <Rss size={28} color="#B8A6FF" />
              <p className="mt-3 font-semibold text-[var(--color-ink)]">아직 보여줄 기사가 없어요</p>
              <p className="text-sm mt-1 text-[var(--color-muted)]">RSS 피드 주소를 등록하면 기사가 여기에 모여요</p>
              <button
                onClick={() => setShowAddFeed(true)}
                className="mt-4 rounded-full px-4 py-2 text-sm font-semibold bg-[var(--color-primary)] text-white"
              >
                피드 추가하기
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleArticles.map((a) => {
              const f = feedById(a.feedId);
              const isSelected = selected?.id === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => selectArticle(a)}
                  className="fg-card text-left rounded-2xl overflow-hidden bg-white flex flex-col"
                  style={{ boxShadow: isSelected ? "0 0 0 2.5px #7C5CFF" : "0 1px 2px rgba(28,23,48,0.06)" }}
                >
                  <div className="relative w-full aspect-[16/10] bg-[var(--color-chip)] overflow-hidden">
                    {a.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Rss size={22} color="#B8A6FF" />
                      </div>
                    )}
                    <span
                      className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono-ui flex items-center gap-1 bg-white"
                      style={{ color: f?.color || "#1C1730" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: f?.color }} />
                      {f?.name}
                    </span>
                  </div>
                  <div className="p-3.5 flex flex-col gap-1.5 flex-1">
                    <h3 className="text-sm font-bold leading-snug line-clamp-2 text-[var(--color-ink)]">
                      {a.title}
                    </h3>
                    {a.description && (
                      <p className="text-xs line-clamp-2 text-[var(--color-muted)]">{a.description}</p>
                    )}
                    <span className="mt-auto pt-1 text-[11px] font-mono-ui text-[var(--color-muted-2)]">
                      {timeAgo(a.pubDate)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </main>

        <aside className="px-5 sm:px-8 py-6 lg:border-l lg:sticky lg:top-[73px] lg:h-[calc(100vh-73px)] overflow-y-auto fg-scroll border-[var(--color-border)]">
          <div className="font-mono-ui text-[11px] uppercase tracking-wider mb-3 text-[var(--color-muted)]">
            인스타그램 미리보기
          </div>

          {!selected ? (
            <div className="rounded-3xl border-2 border-dashed border-[#DCD3FF] flex flex-col items-center justify-center text-center py-14 px-4">
              <Camera size={24} color="#B8A6FF" />
              <p className="text-sm mt-3 text-[var(--color-muted)]">
                왼쪽에서 기사를 선택하면
                <br />
                포스팅 미리보기가 열려요
              </p>
            </div>
          ) : (
            <div className="fg-pop">
              <div
                className="rounded-[2rem] p-2.5 mx-auto bg-[var(--color-ink)]"
                style={{ maxWidth: 300, boxShadow: "0 20px 40px -16px rgba(28,23,48,0.35)" }}
              >
                <div className="rounded-[1.6rem] overflow-hidden bg-white">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <div
                      className="w-7 h-7 rounded-full shrink-0"
                      style={{ background: "linear-gradient(135deg, #FF6B6B, #7C5CFF, #4CC9F0)" }}
                    />
                    <span className="text-xs font-bold text-[var(--color-ink)]">
                      {feedById(selected.feedId)?.name?.toLowerCase().replace(/\s+/g, "") || "myfeed"}
                    </span>
                  </div>
                  <div className="w-full aspect-square bg-[var(--color-chip)]">
                    {selected.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                        <span className="font-display text-lg leading-tight text-[var(--color-ink)]">
                          {selected.title}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 px-3 pt-2.5">
                    <div className="w-5 h-5 rounded-full border-2 border-[var(--color-ink)]" />
                    <div className="w-5 h-5 rounded-full border-2 border-[var(--color-ink)]" />
                    <div className="w-5 h-5 rounded-full border-2 border-[var(--color-ink)]" />
                  </div>
                  <div className="px-3 py-2.5 text-[11px] leading-relaxed text-[var(--color-ink)]">
                    <span className="font-bold mr-1">
                      {feedById(selected.feedId)?.name?.toLowerCase().replace(/\s+/g, "") || "myfeed"}
                    </span>
                    {caption ? (
                      <span className="whitespace-pre-wrap">{caption}</span>
                    ) : (
                      <span className="text-[var(--color-muted-2)]">AI 캡션을 생성해 보세요 ✨</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  onClick={generateCaption}
                  disabled={generating}
                  className="flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold disabled:opacity-60 bg-[var(--color-chip)] text-[var(--color-primary)]"
                >
                  {generating ? <Loader2 size={15} className="fg-spin" /> : <Sparkles size={15} />}
                  {generating ? "캡션 작성 중..." : "AI 캡션 생성"}
                </button>

                <button
                  onClick={handlePost}
                  disabled={posting}
                  className="flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold disabled:opacity-70 text-white"
                  style={{ background: postMode === "posted" ? "#38D9A9" : "#1C1730" }}
                >
                  {posting ? (
                    <>
                      <Loader2 size={16} className="fg-spin" /> 게시 중...
                    </>
                  ) : postMode === "posted" ? (
                    <>
                      <Check size={16} /> 게시 완료
                    </>
                  ) : (
                    <>
                      <Send size={16} /> 인스타그램에 포스팅
                    </>
                  )}
                </button>

                {postResultMsg && (
                  <p
                    className="text-[11px] leading-relaxed px-1"
                    style={{ color: postMode === "error" ? "#FF6B6B" : "#8A80B0" }}
                  >
                    {postResultMsg}
                  </p>
                )}

                <a
                  href={selected.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs font-medium py-1 text-[var(--color-muted)]"
                >
                  원문 기사 보기 <ExternalLink size={12} />
                </a>

                <p className="text-[11px] leading-relaxed mt-1 px-1 text-[var(--color-muted-2)]">
                  실제 게시는 서버에 Instagram Graph API 키가 설정되어 있을 때만 이루어져요.{" "}
                  <button onClick={() => setShowInfo(true)} className="underline font-semibold">
                    자세히 보기
                  </button>
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {showAddFeed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[rgba(28,23,48,0.45)]"
          onClick={() => setShowAddFeed(false)}
        >
          <div className="fg-pop w-full max-w-sm rounded-3xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg text-[var(--color-ink)]">RSS 피드 추가</h2>
              <button onClick={() => setShowAddFeed(false)} aria-label="닫기">
                <X size={18} color="#8A80B0" />
              </button>
            </div>
            <label className="text-xs font-semibold text-[var(--color-ink)]">피드 주소</label>
            <input
              value={feedInput}
              onChange={(e) => setFeedInput(e.target.value)}
              placeholder="https://example.com/rss.xml"
              className="w-full mt-1.5 mb-3 rounded-xl px-3.5 py-2.5 text-sm font-mono-ui bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
            />
            <label className="text-xs font-semibold text-[var(--color-ink)]">표시 이름 (선택)</label>
            <input
              value={feedNameInput}
              onChange={(e) => setFeedNameInput(e.target.value)}
              placeholder="예: 우리 회사 블로그"
              className="w-full mt-1.5 mb-1.5 rounded-xl px-3.5 py-2.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
              onKeyDown={(e) => e.key === "Enter" && handleAddFeed()}
            />
            {addError && <p className="text-xs mt-1 mb-1 text-[var(--color-coral)]">{addError}</p>}
            <button
              onClick={handleAddFeed}
              className="w-full mt-3 rounded-full py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-white"
            >
              <Plus size={15} /> 추가하기
            </button>
          </div>
        </div>
      )}

      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[rgba(28,23,48,0.45)]"
          onClick={() => setShowInfo(false)}
        >
          <div className="fg-pop w-full max-w-md rounded-3xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg text-[var(--color-ink)]">실제 포스팅을 연결하려면</h2>
              <button onClick={() => setShowInfo(false)} aria-label="닫기">
                <X size={18} color="#8A80B0" />
              </button>
            </div>
            <ol className="text-sm space-y-2.5 text-[var(--color-ink)]">
              <li className="flex gap-2">
                <ChevronRight size={16} className="shrink-0 mt-0.5" color="#7C5CFF" />
                인스타그램 계정을 비즈니스/크리에이터 계정으로 전환하고 Facebook 페이지와 연결해요.
              </li>
              <li className="flex gap-2">
                <ChevronRight size={16} className="shrink-0 mt-0.5" color="#7C5CFF" />
                Meta for Developers에서 앱을 만들고 Instagram Graph API 권한과 액세스 토큰을 발급받아요.
              </li>
              <li className="flex gap-2">
                <ChevronRight size={16} className="shrink-0 mt-0.5" color="#7C5CFF" />
                발급받은 값을 Vercel 프로젝트의 INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID 환경변수로
                등록해요.
              </li>
              <li className="flex gap-2">
                <ChevronRight size={16} className="shrink-0 mt-0.5" color="#7C5CFF" />
                환경변수가 설정되면 &apos;포스팅&apos; 버튼이 자동으로 실제 게시로 전환돼요 (별도 코드 수정
                불필요).
              </li>
            </ol>
            <p className="text-xs mt-4 text-[var(--color-muted)]">
              AI 캡션 생성은 서버의 ANTHROPIC_API_KEY 환경변수가 있어야 동작해요. RSS는 서버에서 직접
              가져오기 때문에 브라우저 CORS 문제가 없어요.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2.5 text-sm font-semibold fg-pop flex items-center gap-2 bg-[var(--color-ink)] text-white">
          <Check size={15} color="#C6F135" /> {toast}
        </div>
      )}
    </div>
  );
}
