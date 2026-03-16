import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: body.model || "claude-sonnet-4-20250514",
      max_tokens: body.max_tokens || 2000,
      stream: body.stream || false,
      system: body.system || "",
      messages: body.messages || [],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    return NextResponse.json({ error: err }, { status: res.status });
  }

  // If streaming, pass through the SSE stream
  if (body.stream) {
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
