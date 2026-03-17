import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const sanitisedMessages = body.messages.map(msg => ({
    role: msg.role === "assistant" ? "assistant" : "user",
    content: typeof msg.content === "string" ? msg.content.slice(0, 10000) : String(msg.content).slice(0, 10000),
  }));

  const sanitisedSystem = typeof body.system === "string" ? body.system.slice(0, 8000) : "";
  const maxTokens = Math.min(Number(body.max_tokens) || 2000, 4000);

  const apiBody = {
    model: body.model || "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    stream: body.stream || false,
    system: sanitisedSystem,
    messages: sanitisedMessages,
  };

  if (body.tools) {
    apiBody.tools = body.tools;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(apiBody),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    return NextResponse.json({ error: err }, { status: res.status });
  }

  if (body.stream) {
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
