import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const rateLimits = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 3600000;

function checkRateLimit(ip) {
  const now = Date.now();
  const e = rateLimits.get(ip);
  if (!e || now - e.start > RATE_WINDOW) { rateLimits.set(ip, { start: now, count: 1 }); return true; }
  if (e.count >= RATE_LIMIT) return false;
  e.count++;
  return true;
}

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip)) return NextResponse.json({ error: "Rate limit reached. Try again later." }, { status: 429 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (!body.messages?.length) return NextResponse.json({ error: "No messages" }, { status: 400 });

  const messages = body.messages.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: typeof m.content === "string" ? m.content.slice(0, 10000) : String(m.content).slice(0, 10000),
  }));

  const apiBody = {
    model: body.model || "claude-sonnet-4-20250514",
    max_tokens: Math.min(Number(body.max_tokens) || 2000, 4000),
    system: typeof body.system === "string" ? body.system.slice(0, 8000) : "",
    messages,
  };
  if (body.tools) apiBody.tools = body.tools;
  if (body.stream) apiBody.stream = true;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(apiBody),
  });

  if (!res.ok) { const err = await res.text().catch(() => "Error"); return NextResponse.json({ error: err }, { status: res.status }); }
  if (body.stream) return new Response(res.body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });

  const data = await res.json();
  return NextResponse.json(data);
}
