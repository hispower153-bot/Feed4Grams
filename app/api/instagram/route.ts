import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────
 *  Instagram Graph API — Simple & Efficient
 *  Supports: single image, carousel (최대 10장), reels (video)
 *
 *  Required env vars:
 *    INSTAGRAM_ACCESS_TOKEN
 *    INSTAGRAM_BUSINESS_ID
 *  Optional:
 *    GRAPH_API_VERSION  (default: v21.0)
 * ────────────────────────────────────────────── */

const GRAPH_VERSION = process.env.GRAPH_API_VERSION || "v21.0";
const MAX_POLL_ATTEMPTS = 30;        // 최대 폴링 횟수
const POLL_INTERVAL_MS = 2_000;      // 초기 폴링 간격 (2초)

// ─── Helpers ───────────────────────────────────
function env() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_BUSINESS_ID;
  return { accessToken, igUserId };
}

function baseUrl(igUserId: string) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function fail(error: string, message: string, detail?: unknown, status = 400) {
  return NextResponse.json({ ok: false, error, message, detail }, { status });
}

function ok(data: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...data });
}

// ─── Graph API fetch wrapper ───────────────────
async function graphPost(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { res, data };
}

async function graphGet(url: string) {
  const res = await fetch(url);
  const data = await res.json();
  return { res, data };
}

// ─── Wait for container to become FINISHED ─────
async function waitForContainer(containerId: string, accessToken: string): Promise<{ ready: boolean; error?: string }> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const { data } = await graphGet(
      `https://graph.facebook.com/${GRAPH_VERSION}/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );

    if (data.status_code === "FINISHED") return { ready: true };
    if (data.status_code === "ERROR") {
      return { ready: false, error: data.status || "미디어 처리 중 오류 발생" };
    }

    // 점진적 대기 (2s → 3s → 4s ... 최대 5s)
    await sleep(Math.min(POLL_INTERVAL_MS + i * 500, 5_000));
  }
  return { ready: false, error: "미디어 처리 시간 초과 (타임아웃)" };
}

// ─── Publish container ─────────────────────────
async function publishContainer(igUserId: string, containerId: string, accessToken: string) {
  const { res, data } = await graphPost(`${baseUrl(igUserId)}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  if (!res.ok || !data.id) {
    return { published: false, error: data };
  }
  return { published: true, mediaId: data.id as string };
}

// ─── Get permalink ─────────────────────────────
async function getPermalink(mediaId: string, accessToken: string): Promise<string | null> {
  try {
    const { data } = await graphGet(
      `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}?fields=permalink&access_token=${accessToken}`
    );
    return data.permalink || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════
//  POST  /api/instagram
//
//  Body (JSON):
//    ● 단일 이미지:  { imageUrl, caption? }
//    ● 캐러셀:       { carouselUrls: string[], caption? }
//    ● 릴스(비디오):  { videoUrl, caption?, coverUrl? }
// ═══════════════════════════════════════════════
export async function POST(request: NextRequest) {
  // 1. Parse body
  let body: {
    imageUrl?: string;
    caption?: string;
    carouselUrls?: string[];
    videoUrl?: string;
    coverUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return fail("INVALID_BODY", "요청 형식이 올바르지 않아요.", undefined, 400);
  }

  // 2. Check env
  const { accessToken, igUserId } = env();
  if (!accessToken || !igUserId) {
    return fail(
      "MISSING_CREDENTIALS",
      "INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ID 환경변수를 .env.local에 설정해 주세요.",
      undefined,
      401
    );
  }

  const { imageUrl, caption = "", carouselUrls, videoUrl, coverUrl } = body;
  const base = baseUrl(igUserId);

  try {
    // ─── A) Carousel (캐러셀) ───────────────────
    if (carouselUrls && carouselUrls.length >= 2) {
      if (carouselUrls.length > 10) {
        return fail("TOO_MANY_IMAGES", "캐러셀은 최대 10장까지 가능해요.", undefined, 400);
      }

      // Step 1: 각 이미지 컨테이너 생성
      const childIds: string[] = [];
      for (const url of carouselUrls) {
        const { res, data } = await graphPost(`${base}/media`, {
          image_url: url,
          is_carousel_item: true,
          access_token: accessToken,
        });
        if (!res.ok || !data.id) {
          return fail("CAROUSEL_ITEM_FAILED", `캐러셀 이미지 컨테이너 생성 실패: ${url}`, data, 502);
        }
        childIds.push(data.id);
      }

      // Step 1.5: 모든 child 컨테이너 처리 완료 대기
      for (const cid of childIds) {
        const { ready, error } = await waitForContainer(cid, accessToken);
        if (!ready) return fail("CAROUSEL_ITEM_PROCESSING", error || "캐러셀 이미지 처리 실패", undefined, 502);
      }

      // Step 2: 캐러셀 컨테이너 생성
      const { res: carRes, data: carData } = await graphPost(`${base}/media`, {
        media_type: "CAROUSEL",
        children: childIds,
        caption,
        access_token: accessToken,
      });
      if (!carRes.ok || !carData.id) {
        return fail("CAROUSEL_CREATE_FAILED", "캐러셀 컨테이너 생성에 실패했어요.", carData, 502);
      }

      // Step 3: Publish
      const pub = await publishContainer(igUserId, carData.id, accessToken);
      if (!pub.published) return fail("PUBLISH_FAILED", "캐러셀 게시에 실패했어요.", pub.error, 502);

      const permalink = await getPermalink(pub.mediaId!, accessToken);
      return ok({ type: "carousel", mediaId: pub.mediaId, permalink });
    }

    // ─── B) Reels / Video ───────────────────────
    if (videoUrl) {
      const { res, data } = await graphPost(`${base}/media`, {
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        ...(coverUrl ? { cover_url: coverUrl } : {}),
        access_token: accessToken,
      });
      if (!res.ok || !data.id) {
        return fail("VIDEO_CREATE_FAILED", "릴스 컨테이너 생성에 실패했어요.", data, 502);
      }

      // 비디오는 처리 시간이 오래 걸릴 수 있음
      const { ready, error } = await waitForContainer(data.id, accessToken);
      if (!ready) return fail("VIDEO_PROCESSING", error || "비디오 처리 실패", undefined, 504);

      const pub = await publishContainer(igUserId, data.id, accessToken);
      if (!pub.published) return fail("PUBLISH_FAILED", "릴스 게시에 실패했어요.", pub.error, 502);

      const permalink = await getPermalink(pub.mediaId!, accessToken);
      return ok({ type: "reels", mediaId: pub.mediaId, permalink });
    }

    // ─── C) Single Image (기본) ─────────────────
    if (!imageUrl) {
      return fail("MISSING_MEDIA", "imageUrl, videoUrl, 또는 carouselUrls 중 하나가 필요해요.", undefined, 400);
    }

    const { res, data } = await graphPost(`${base}/media`, {
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    });
    if (!res.ok || !data.id) {
      return fail("MEDIA_CREATE_FAILED", "이미지 컨테이너 생성에 실패했어요.", data, 502);
    }

    const { ready, error } = await waitForContainer(data.id, accessToken);
    if (!ready) return fail("MEDIA_PROCESSING", error || "이미지 처리 실패", undefined, 504);

    const pub = await publishContainer(igUserId, data.id, accessToken);
    if (!pub.published) return fail("PUBLISH_FAILED", "게시에 실패했어요.", pub.error, 502);

    const permalink = await getPermalink(pub.mediaId!, accessToken);
    return ok({ type: "image", mediaId: pub.mediaId, permalink });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail("REQUEST_FAILED", "게시 중 예기치 못한 오류가 발생했어요.", message, 502);
  }
}

// ═══════════════════════════════════════════════
//  GET  /api/instagram
//  → 연결 상태 확인 (토큰 유효성 / 계정 정보)
// ═══════════════════════════════════════════════
export async function GET() {
  const { accessToken, igUserId } = env();

  if (!accessToken || !igUserId) {
    return fail("MISSING_CREDENTIALS", "환경변수가 설정되지 않았어요.", undefined, 401);
  }

  try {
    const { data } = await graphGet(
      `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}?fields=name,username,profile_picture_url,media_count&access_token=${accessToken}`
    );

    if (data.error) {
      return fail("TOKEN_INVALID", "토큰이 만료되었거나 유효하지 않아요.", data.error, 401);
    }

    return ok({
      connected: true,
      account: {
        name: data.name,
        username: data.username,
        profilePicture: data.profile_picture_url,
        mediaCount: data.media_count,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail("CONNECTION_FAILED", "인스타그램 연결 확인에 실패했어요.", message, 502);
  }
}
