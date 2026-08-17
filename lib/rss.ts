import Parser from "rss-parser";
import type { FeedArticle, FeedResult } from "./types";

type CustomItem = {
  mediaContent?: Array<{ $?: { url?: string; medium?: string } }>;
  mediaThumbnail?: { $?: { url?: string } };
  contentEncoded?: string;
};

const parser: Parser<Record<string, unknown>, CustomItem> = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; Feed4GramsBot/1.0; +https://vercel.com)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function firstImgSrc(html: string | undefined): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"'>]+)["']/i);
  return match ? match[1] : null;
}

function extractImage(item: Parser.Item & CustomItem): string | null {
  if (item.enclosure?.url && (!item.enclosure.type || item.enclosure.type.startsWith("image"))) {
    return item.enclosure.url;
  }
  const media = item.mediaContent?.find((m) => m?.$?.url);
  if (media?.$?.url) return media.$.url;
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  const fromContent = firstImgSrc(item.contentEncoded) || firstImgSrc(item.content) || firstImgSrc(item.contentSnippet);
  return fromContent || null;
}

export async function fetchAndParseFeed(feedUrl: string): Promise<FeedResult> {
  const parsed = await parser.parseURL(feedUrl);

  const items: FeedArticle[] = (parsed.items || []).slice(0, 30).map((item, idx) => {
    const rawDescription = item.contentSnippet || stripHtml(item.content) || stripHtml(item.summary as string | undefined);
    return {
      id: item.guid || item.link || `${feedUrl}-${idx}`,
      title: stripHtml(item.title) || "제목 없음",
      link: item.link || "",
      pubDate: item.isoDate || item.pubDate || "",
      description: (rawDescription || "").slice(0, 280),
      image: extractImage(item),
    };
  });

  return {
    channelTitle: parsed.title || feedUrl,
    items,
  };
}
