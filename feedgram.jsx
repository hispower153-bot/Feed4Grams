import React, { useState, useRef, useCallback, useEffect } from "react";
import { Rss, Plus, X, Instagram, Sparkles, Send, Check, Loader2, ExternalLink, Settings2, ChevronRight } from "lucide-react";

const FEED_COLORS = ["#FF6B6B", "#7C5CFF", "#4CC9F0", "#FFB84C", "#FF6FB5", "#38D9A9"];
const PROXY = "https://api.allorigins.win/raw?url=";

const SEED_FEEDS = [
  { url: "https://technologyreview.com/feed/", name: "MIT" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function stripTags(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
}

function extractImage(itemEl, descriptionHtml) {
  const media = itemEl.getElementsByTagNameNS("*", "content")[0];
  if (media && media.getAttribute && media.getAttribute("url")) return media.getAttribute("url");
  const enclosure = itemEl.querySelector("enclosure[url]");
  if (enclosure) {
    const type = enclosure.getAttribute("type") || "";
    if (type.startsWith("image") || !type) return enclosure.getAttribute("url");
  }
  const thumb = itemEl.getElementsByTagNameNS("*", "thumbnail")[0];
  if (thumb && thumb.getAttribute("url")) return thumb.getAttribute("url");
  if (descriptionHtml) {
    const match = descriptionHtml.match(/<img[^>]+src=["']([^"'>]+)["']/i);
    if (match) return match[1];
  }
  return null;
}

function parseFeed(xmlText, feedUrl) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("PARSE_ERROR");

  const isAtom = doc.querySelector("feed") && !doc.querySelector("rss");
  const channelTitle =
    doc.querySelector("channel > title")?.textContent ||
    doc.querySelector("feed > title")?.textContent ||
    feedUrl;

  const nodeList = isAtom ? doc.querySelectorAll("entry") : doc.querySelectorAll("item");
  const items = Array.from(nodeList)
    .slice(0, 24)
    .map((el) => {
      const title = el.querySelector("title")?.textContent?.trim() || "제목 없음";
      let link = el.querySelector("link")?.textContent?.trim();
      if (!link) {
        const linkEl = el.querySelector("link");
        link = linkEl?.getAttribute?.("href") || "";
      }
      const pubDate =
        el.querySelector("pubDate")?.textContent ||
        el.querySelector("published")?.textContent ||
        el.querySelector("updated")?.textContent ||
        "";
      const rawDesc =
        el.querySelector("description")?.textContent ||
        el.querySelector("summary")?.textContent ||
        el.querySelector("content")?.textContent ||
        "";
      const description = stripTags(rawDesc).slice(0, 260);
      const image = extractImage(el, rawDesc);
      return {
        id: uid(),
        title: stripTags(title),
        link,
        pubDate,
        description,
        image,
      };
    })
    .filter((it) => it.title);

  return { channelTitle: stripTags(channelTitle), items };
}

function timeAgo(dateStr) {
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

export default function FeedGram() {
  const [feeds, setFeeds] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loadingCount, setLoadingCount] = useState(0);
  const [activeFeedId, setActiveFeedId] = useState("all");
  const [selected, setSelected] = useState(null);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [feedInput, setFeedInput] = useState("");
  const [feedNameInput, setFeedNameInput] = useState("");
  const [addError, setAddError] = useState("");
  const [caption, setCaption] = useState("");
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [toast, setToast] = useState(null);
  const colorIdx = useRef(0);

  const nextColor = () => {
    const c = FEED_COLORS[colorIdx.current % FEED_COLORS.length];
    colorIdx.current += 1;
    return c;
  };

  const loadFeed = useCallback(async (feed) => {
    setLoadingCount((n) => n + 1);
    try {
      const res = await fetch(PROXY + encodeURIComponent(feed.url));
      if (!res.ok) throw new Error("FETCH_FAILED");
      const text = await res.text();
      const { channelTitle, items } = parseFeed(text, feed.url);
      setFeeds((prev) =>
        prev.map((f) => (f.id === feed.id ? { ...f, name: f.customName || channelTitle, error: false } : f))
      );
      setArticles((prev) => {
        const others = prev.filter((a) => a.feedId !== feed.id);
        const withFeed = items.map((it) => ({ ...it, feedId: feed.id }));
        return [...others, ...withFeed].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      });
    } catch (e) {
      setFeeds((prev) => prev.map((f) => (f.id === feed.id ? { ...f, error: true } : f)));
    } finally {
      setLoadingCount((n) => Math.max(0, n - 1));
    }
  }, []);

  useEffect(() => {
    const seeded = SEED_FEEDS.map((s) => ({
      id: uid(),
      url: s.url,
      name: s.name,
      customName: s.name,
      color: nextColor(),
    }));
    setFeeds(seeded);
    seeded.forEach((f) => loadFeed(f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddFeed = async () => {
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
    const feed = {
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

  const removeFeed = (id) => {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    setArticles((prev) => prev.filter((a) => a.feedId !== id));
    if (activeFeedId === id) setActiveFeedId("all");
    if (selected?.feedId === id) setSelected(null);
  };

  const visibleArticles =
    activeFeedId === "all" ? articles : articles.filter((a) => a.feedId === activeFeedId);

  const feedById = (id) => feeds.find((f) => f.id === id);

  const selectArticle = (article) => {
    setSelected(article);
    setCaption("");
    setPosted(false);
  };

  const generateCaption = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      const prompt = `너는 한국 인스타그램 계정 운영자야. 아래 뉴스 기사를 인스타그램 카드뉴스 게시물 캡션으로 바꿔줘.
조건: 2~3문장, 친근한 반말이 아닌 존댓말, 이모지 2~4개 자연스럽게 섞기, 마지막 줄에 관련 해시태그 6~8개.
캡션 텍스트만 출력하고 다른 설명은 붙이지 마.

기사 제목: ${selected.title}
기사 요약: ${selected.description || "(요약 없음)"}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      setCaption(text || "캡션을 생성하지 못했어요. 다시 시도해 주세요.");
    } catch (e) {
      setCaption("캡션 생성 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setGenerating(false);
    }
  };

  const handlePost = () => {
    if (!selected || posting) return;
    setPosting(true);
    setTimeout(() => {
      setPosting(false);
      setPosted(true);
      setToast("게시물 미리보기가 준비됐어요");
      setTimeout(() => setToast(null), 2600);
    }, 1400);
  };

  return (
    <div
      className="w-full min-h-screen"
      style={{
        background: "#F6F3FF",
        fontFamily: "'Pretendard', sans-serif",
        color: "#1C1730",
      }}
    >
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css');
        @import url('https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=JetBrains+Mono:wght@400;600&display=swap');
        .fg-display { font-family: 'Black Han Sans', sans-serif; letter-spacing: 0.01em; }
        .fg-mono { font-family: 'JetBrains Mono', monospace; }
        .fg-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .fg-scroll::-webkit-scrollbar-thumb { background: #D9D2FF; border-radius: 999px; }
        .fg-card { transition: transform .18s ease, box-shadow .18s ease; }
        .fg-card:hover { transform: translateY(-3px); box-shadow: 0 12px 24px -8px rgba(28,23,48,0.18); }
        @keyframes fg-pop { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .fg-pop { animation: fg-pop .25s ease; }
        @keyframes fg-spin-slow { to { transform: rotate(360deg); } }
        .fg-spin { animation: fg-spin-slow 1s linear infinite; }
        *:focus-visible { outline: 2px solid #7C5CFF; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .fg-card, .fg-pop { animation: none !important; transition: none !important; }
        }
      `}</style>

      {/* Top bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-5 sm:px-8 py-4 border-b"
        style={{ background: "rgba(246,243,255,0.9)", backdropFilter: "blur(8px)", borderColor: "#E4DCFF" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "#1C1730" }}
          >
            <Rss size={17} color="#C6F135" strokeWidth={2.5} />
          </div>
          <span className="fg-display text-2xl sm:text-3xl" style={{ color: "#1C1730" }}>
            피드그램
          </span>
          <span
            className="hidden sm:inline-block ml-1 px-2 py-0.5 rounded-full fg-mono text-[10px]"
            style={{ background: "#EDE7FF", color: "#7C5CFF" }}
          >
            RSS → IG
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddFeed(true)}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: "#7C5CFF", color: "#fff" }}
          >
            <Plus size={16} /> 피드 추가
          </button>
          <button
            onClick={() => setShowInfo(true)}
            aria-label="설정 및 안내"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "#EDE7FF", color: "#1C1730" }}
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[220px_1fr_360px] gap-0">
        {/* Sidebar: feed list */}
        <aside className="hidden lg:block px-5 py-6 border-r" style={{ borderColor: "#E4DCFF" }}>
          <div className="fg-mono text-[11px] uppercase tracking-wider mb-3" style={{ color: "#8A80B0" }}>
            내 피드 · {feeds.length}
          </div>
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => setActiveFeedId("all")}
              className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-left"
              style={{
                background: activeFeedId === "all" ? "#1C1730" : "transparent",
                color: activeFeedId === "all" ? "#fff" : "#1C1730",
              }}
            >
              전체 보기
              <span className="fg-mono text-[11px] opacity-70">{articles.length}</span>
            </button>
            {feeds.map((f) => (
              <div key={f.id} className="group relative">
                <button
                  onClick={() => setActiveFeedId(f.id)}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-left pr-7"
                  style={{
                    background: activeFeedId === f.id ? "#1C1730" : "transparent",
                    color: activeFeedId === f.id ? "#fff" : "#1C1730",
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: f.color, boxShadow: `0 0 0 3px ${f.color}22` }}
                  />
                  <span className="truncate flex-1">{f.name}</span>
                  {f.error && <span className="text-[10px]" style={{ color: "#FF6B6B" }}>!</span>}
                </button>
                <button
                  onClick={() => removeFeed(f.id)}
                  aria-label={`${f.name} 피드 삭제`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ color: activeFeedId === f.id ? "#fff" : "#8A80B0" }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </nav>
          {feeds.length === 0 && (
            <p className="text-xs mt-3" style={{ color: "#8A80B0" }}>
              등록된 피드가 없어요. 상단의 '피드 추가'로 시작해 보세요.
            </p>
          )}
        </aside>

        {/* Main article grid */}
        <main className="px-5 sm:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="fg-display text-xl" style={{ color: "#1C1730" }}>
              {activeFeedId === "all" ? "최신 기사" : feedById(activeFeedId)?.name || "기사"}
            </h1>
            {loadingCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs fg-mono" style={{ color: "#8A80B0" }}>
                <Loader2 size={13} className="fg-spin" /> 불러오는 중
              </span>
            )}
          </div>

          {/* mobile feed chips */}
          <div className="flex lg:hidden gap-2 overflow-x-auto fg-scroll pb-3 mb-1 -mx-1 px-1">
            <button
              onClick={() => setActiveFeedId("all")}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{
                background: activeFeedId === "all" ? "#1C1730" : "#EDE7FF",
                color: activeFeedId === "all" ? "#fff" : "#1C1730",
              }}
            >
              전체
            </button>
            {feeds.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFeedId(f.id)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                style={{
                  background: activeFeedId === f.id ? "#1C1730" : "#EDE7FF",
                  color: activeFeedId === f.id ? "#fff" : "#1C1730",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: f.color }} />
                {f.name}
              </button>
            ))}
          </div>

          {visibleArticles.length === 0 && loadingCount === 0 && (
            <div
              className="rounded-3xl border-2 border-dashed flex flex-col items-center justify-center text-center py-16 px-6"
              style={{ borderColor: "#DCD3FF" }}
            >
              <Rss size={28} color="#B8A6FF" />
              <p className="mt-3 font-semibold" style={{ color: "#1C1730" }}>
                아직 보여줄 기사가 없어요
              </p>
              <p className="text-sm mt-1" style={{ color: "#8A80B0" }}>
                RSS 피드 주소를 등록하면 기사가 여기에 모여요
              </p>
              <button
                onClick={() => setShowAddFeed(true)}
                className="mt-4 rounded-full px-4 py-2 text-sm font-semibold"
                style={{ background: "#7C5CFF", color: "#fff" }}
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
                  style={{
                    boxShadow: isSelected ? `0 0 0 2.5px #7C5CFF` : "0 1px 2px rgba(28,23,48,0.06)",
                  }}
                >
                  <div className="relative w-full aspect-[16/10] bg-[#EDE7FF] overflow-hidden">
                    {a.image ? (
                      <img src={a.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Rss size={22} color="#B8A6FF" />
                      </div>
                    )}
                    <span
                      className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold fg-mono flex items-center gap-1"
                      style={{ background: "#fff", color: f?.color || "#1C1730" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: f?.color }} />
                      {f?.name}
                    </span>
                  </div>
                  <div className="p-3.5 flex flex-col gap-1.5 flex-1">
                    <h3 className="text-sm font-bold leading-snug line-clamp-2" style={{ color: "#1C1730" }}>
                      {a.title}
                    </h3>
                    {a.description && (
                      <p className="text-xs line-clamp-2" style={{ color: "#8A80B0" }}>
                        {a.description}
                      </p>
                    )}
                    <span className="mt-auto pt-1 text-[11px] fg-mono" style={{ color: "#B0A8D4" }}>
                      {timeAgo(a.pubDate)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </main>

        {/* Right: Instagram preview */}
        <aside
          className="px-5 sm:px-8 py-6 lg:border-l lg:sticky lg:top-[73px] lg:h-[calc(100vh-73px)] overflow-y-auto fg-scroll"
          style={{ borderColor: "#E4DCFF" }}
        >
          <div className="fg-mono text-[11px] uppercase tracking-wider mb-3" style={{ color: "#8A80B0" }}>
            인스타그램 미리보기
          </div>

          {!selected ? (
            <div
              className="rounded-3xl border-2 border-dashed flex flex-col items-center justify-center text-center py-14 px-4"
              style={{ borderColor: "#DCD3FF" }}
            >
              <Instagram size={24} color="#B8A6FF" />
              <p className="text-sm mt-3" style={{ color: "#8A80B0" }}>
                왼쪽에서 기사를 선택하면
                <br />
                포스팅 미리보기가 열려요
              </p>
            </div>
          ) : (
            <div className="fg-pop">
              {/* phone frame */}
              <div
                className="rounded-[2rem] p-2.5 mx-auto"
                style={{ background: "#1C1730", maxWidth: 300, boxShadow: "0 20px 40px -16px rgba(28,23,48,0.35)" }}
              >
                <div className="rounded-[1.6rem] overflow-hidden bg-white">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <div
                      className="w-7 h-7 rounded-full shrink-0"
                      style={{ background: `linear-gradient(135deg, #FF6B6B, #7C5CFF, #4CC9F0)` }}
                    />
                    <span className="text-xs font-bold" style={{ color: "#1C1730" }}>
                      {feedById(selected.feedId)?.name?.toLowerCase().replace(/\s+/g, "") || "myfeed"}
                    </span>
                  </div>
                  <div className="w-full aspect-square bg-[#EDE7FF]">
                    {selected.image ? (
                      <img src={selected.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                        <span
                          className="fg-display text-lg leading-tight"
                          style={{ color: "#1C1730" }}
                        >
                          {selected.title}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 px-3 pt-2.5">
                    <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: "#1C1730" }} />
                    <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: "#1C1730" }} />
                    <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: "#1C1730" }} />
                  </div>
                  <div className="px-3 py-2.5 text-[11px] leading-relaxed" style={{ color: "#1C1730" }}>
                    <span className="font-bold mr-1">
                      {feedById(selected.feedId)?.name?.toLowerCase().replace(/\s+/g, "") || "myfeed"}
                    </span>
                    {caption ? (
                      <span className="whitespace-pre-wrap">{caption}</span>
                    ) : (
                      <span style={{ color: "#B0A8D4" }}>AI 캡션을 생성해 보세요 ✨</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  onClick={generateCaption}
                  disabled={generating}
                  className="flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold disabled:opacity-60"
                  style={{ background: "#EDE7FF", color: "#7C5CFF" }}
                >
                  {generating ? <Loader2 size={15} className="fg-spin" /> : <Sparkles size={15} />}
                  {generating ? "캡션 작성 중..." : "AI 캡션 생성"}
                </button>

                <button
                  onClick={handlePost}
                  disabled={posting}
                  className="flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold disabled:opacity-70"
                  style={{
                    background: posted ? "#38D9A9" : "#1C1730",
                    color: "#fff",
                  }}
                >
                  {posting ? (
                    <>
                      <Loader2 size={16} className="fg-spin" /> 게시 중...
                    </>
                  ) : posted ? (
                    <>
                      <Check size={16} /> 게시 완료 (데모)
                    </>
                  ) : (
                    <>
                      <Send size={16} /> 인스타그램에 포스팅
                    </>
                  )}
                </button>

                <a
                  href={selected.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs font-medium py-1"
                  style={{ color: "#8A80B0" }}
                >
                  원문 기사 보기 <ExternalLink size={12} />
                </a>

                <p className="text-[11px] leading-relaxed mt-1 px-1" style={{ color: "#B0A8D4" }}>
                  실제 인스타그램 게시는 Meta의 Instagram Graph API 연동(비즈니스 계정 · 액세스 토큰 · 서버)이
                  필요해요. 위 버튼은 게시물이 어떻게 보일지 확인하는 미리보기예요.{" "}
                  <button onClick={() => setShowInfo(true)} className="underline font-semibold">
                    자세히 보기
                  </button>
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Add feed modal */}
      {showAddFeed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: "rgba(28,23,48,0.45)" }}
          onClick={() => setShowAddFeed(false)}
        >
          <div
            className="fg-pop w-full max-w-sm rounded-3xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="fg-display text-lg" style={{ color: "#1C1730" }}>
                RSS 피드 추가
              </h2>
              <button onClick={() => setShowAddFeed(false)} aria-label="닫기">
                <X size={18} color="#8A80B0" />
              </button>
            </div>
            <label className="text-xs font-semibold" style={{ color: "#1C1730" }}>
              피드 주소
            </label>
            <input
              value={feedInput}
              onChange={(e) => setFeedInput(e.target.value)}
              placeholder="https://example.com/rss.xml"
              className="w-full mt-1.5 mb-3 rounded-xl px-3.5 py-2.5 text-sm fg-mono"
              style={{ background: "#F6F3FF", border: "1.5px solid #E4DCFF", color: "#1C1730" }}
            />
            <label className="text-xs font-semibold" style={{ color: "#1C1730" }}>
              표시 이름 (선택)
            </label>
            <input
              value={feedNameInput}
              onChange={(e) => setFeedNameInput(e.target.value)}
              placeholder="예: 우리 회사 블로그"
              className="w-full mt-1.5 mb-1.5 rounded-xl px-3.5 py-2.5 text-sm"
              style={{ background: "#F6F3FF", border: "1.5px solid #E4DCFF", color: "#1C1730" }}
              onKeyDown={(e) => e.key === "Enter" && handleAddFeed()}
            />
            {addError && (
              <p className="text-xs mt-1 mb-1" style={{ color: "#FF6B6B" }}>
                {addError}
              </p>
            )}
            <button
              onClick={handleAddFeed}
              className="w-full mt-3 rounded-full py-2.5 text-sm font-bold flex items-center justify-center gap-1.5"
              style={{ background: "#7C5CFF", color: "#fff" }}
            >
              <Plus size={15} /> 추가하기
            </button>
          </div>
        </div>
      )}

      {/* Info modal */}
      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: "rgba(28,23,48,0.45)" }}
          onClick={() => setShowInfo(false)}
        >
          <div
            className="fg-pop w-full max-w-md rounded-3xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="fg-display text-lg" style={{ color: "#1C1730" }}>
                실제 포스팅을 연결하려면
              </h2>
              <button onClick={() => setShowInfo(false)} aria-label="닫기">
                <X size={18} color="#8A80B0" />
              </button>
            </div>
            <ol className="text-sm space-y-2.5" style={{ color: "#1C1730" }}>
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
                토큰은 브라우저가 아닌 서버(백엔드)에 보관하고, 서버가 이미지 URL과 캡션을 Graph API로
                전달해 게시를 대신 실행해요.
              </li>
              <li className="flex gap-2">
                <ChevronRight size={16} className="shrink-0 mt-0.5" color="#7C5CFF" />
                이 화면의 '포스팅' 버튼은 위 서버 엔드포인트를 호출하도록 바꾸면 실제 게시로 이어질 수 있어요.
              </li>
            </ol>
            <p className="text-xs mt-4" style={{ color: "#8A80B0" }}>
              RSS 파싱은 공개 CORS 프록시(allorigins)를 거쳐 브라우저에서 바로 가져와요. 일부 피드는
              프록시 제한으로 실패할 수 있어요.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2.5 text-sm font-semibold fg-pop flex items-center gap-2"
          style={{ background: "#1C1730", color: "#fff" }}
        >
          <Check size={15} color="#C6F135" /> {toast}
        </div>
      )}
    </div>
  );
}
