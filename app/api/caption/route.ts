import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "NOT_CONFIGURED",
        message: "서버에 ANTHROPIC_API_KEY 환경변수가 설정되어 있지 않아요.",
      },
      { status: 501 }
    );
  }

  let body: { title?: string; description?: string; tone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY", message: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const title = (body.title || "").slice(0, 300);
  const description = (body.description || "").slice(0, 600);
  const tone = body.tone || "professional";
  if (!title) {
    return NextResponse.json({ error: "MISSING_TITLE", message: "title이 필요해요." }, { status: 400 });
  }

  let toneInstruction = "2~3문장, 격식있고 명확한 존댓말, 이모지 2~3개, 핵심 요약 위주로 작성.";
  if (tone === "trendy") {
    toneInstruction = "MZ세대가 친근하게 느끼는 트렌디한 어조, 신선한 이모지 4~5개, 호기심을 자극하는 문장.";
  } else if (tone === "insight") {
    toneInstruction = "3줄 핵심 포인트 정리 (• 1번째, • 2번째, • 3번째), 생각거리를 던지는 질문으로 마무리.";
  } else if (tone === "cta") {
    toneInstruction = "팔로우와 저장, 댓글 참여를 유도하는 가벼운 호소형 문장 포함 (예: '도움이 되셨다면 저장 📌 & 친구 태그!').";
  }

  const prompt = `너는 한국 인스타그램 전문 마케팅 에디터야. 아래 뉴스 기사를 인스타그램 게시물 캡션으로 작성해줘.
어조 스타일: ${toneInstruction}
마지막 줄에는 독자 검색용 관련 해시태그 6~8개를 작성해줘.
캡션 본문과 해시태그만 출력하고 부연 설명은 전혀 붙이지 마.

기사 제목: ${title}
기사 요약: ${description || "(요약 없음)"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: "ANTHROPIC_ERROR", message: "캡션 생성 API 호출에 실패했어요.", detail: errText },
        { status: 502 }
      );
    }

    const data = await res.json();
    const caption = (data.content || [])
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("\n")
      .trim();

    if (!caption) {
      return NextResponse.json(
        { error: "EMPTY_RESPONSE", message: "캡션을 생성하지 못했어요." },
        { status: 502 }
      );
    }

    return NextResponse.json({ caption });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "REQUEST_FAILED", message: "캡션 생성 중 오류가 발생했어요.", detail: message },
      { status: 502 }
    );
  }
}
