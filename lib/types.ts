export type FeedArticle = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
  image: string | null;
};

export type FeedResult = {
  channelTitle: string;
  items: FeedArticle[];
};

export type SavedFeed = {
  id: string;
  url: string;
  name: string;
  customName: string | null;
  color: string;
};

export type CaptionTone = "professional" | "trendy" | "insight" | "cta";

export type CardTemplateTheme = "dark" | "cream" | "neon" | "pastel";

export type CardAspectRatio = "1:1" | "4:5";

export type CaptionResponse = {
  caption: string;
};

export type InstagramPostResponse =
  | { mode: "preview"; message: string }
  | { mode: "posted"; permalink: string | null };

export type ScheduledPost = {
  id: string;
  articleTitle: string;
  feedName: string;
  scheduledTime: string;
  status: "scheduled" | "posted";
};

