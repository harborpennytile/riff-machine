"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import storage from "@/lib/storage";
import { exportSeedMarkdown, exportAllMarkdown, downloadMarkdown, copyToClipboard } from "@/lib/export";

const API_URL = "/api/riff";
const MODEL = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const STORAGE_KEY = "riffmachine:v3";

const SEED_CATEGORIES = ["art", "music", "tech", "philosophy", "finance", "food", "nature", "news", "random", "other"];
const ICONS = { article: "\u{1F4C4}", visual: "\u{1F5BC}", music: "\u{1F3B5}", book: "\u{1F4D6}", concept: "\u{1F4A1}", person: "\u{1F464}" };
const CAT_ICONS = { art: "\u{1F3A8}", music: "\u{1F3B6}", tech: "\u26A1", philosophy: "\u{1F9E0}", finance: "\u{1F4B0}", food: "\u{1F373}", nature: "\u{1F33F}", news: "\u{1F4F0}", random: "\u{1F3B2}", other: "✦" };
const TYPE_LABELS = { article: "Article", visual: "Visual", music: "Music", book: "Book", concept: "Concept", person: "Person" };

/* ── Sanitisation ── */
function sanitiseInput(text) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/[{}<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/* ── Storage ── */
async function loadState() {
  for (const key of [STORAGE_KEY, "riffmachine:v2", "riffmachine:state"]) {
    try {
      const r = await storage.get(key);
      if (r?.value) {
        const p = JSON.parse(r.value);
        if (p?.seeds?.length) return p;
      }
    } catch {}
  }
  return null;
}
async function saveState(state) {
  try { await storage.set(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

/* ── Streaming API ── */
async function streamAPI(system, userMsg, onChunk, signal) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, stream: true, system, messages: [{ role: "user", content: userMsg }] }),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", fullText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === "content_block_delta" && evt.delta?.text) {
          fullText += evt.delta.text;
          onChunk(fullText);
        }
      } catch {}
    }
  }
  return fullText;
}

/* ── JSON extraction ── */
function extractItems(text) {
  const items = [];
  const regex = /\{[^{}]*"type"\s*:\s*"[^"]+?"[^{}]*"title"\s*:\s*"[^"]*?"[^{}]*\}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.type && obj.title) items.push(obj);
    } catch {}
  }
  return items;
}

/* ── Prompts ── */
function riffPrompt(selectedSeed, allSeeds) {
  const seedText = selectedSeed.text;
  const category = selectedSeed.category;
  const others = (allSeeds || []).filter(s => s.id !== selectedSeed.id);
  const isMultiSeed = others.length > 0;

  let seedList = "";
  let prevResources = "";
  if (isMultiSeed) {
    seedList = allSeeds.map(s => {
      const marker = s.id === selectedSeed.id ? " (FOCUSED)" : "";
      return `- [${s.category}] "${s.text}"${marker}`;
    }).join("\n");
    const allPrev = allSeeds.flatMap(s =>
      (s.riffs || []).map(r => `- "${r.title}" (from "${s.text}")`)
    );
    prevResources = allPrev.length > 0
      ? "\n\nPreviously discovered resources (titles only):\n" + allPrev.join("\n")
      : "";
  }

  const multiSeedSystem = `You are a creative discovery engine that finds unexpected connections ACROSS multiple ideas.

The user has a collection of seed ideas across different domains. Your job is to find resources that BRIDGE between these seeds -- not just match one of them. The best results are ones nobody would find by searching any single seed alone.

The user is currently focused on: "${seedText}" [${category}]

Their full collection of seeds:
${seedList}${prevResources}

Return ONLY a JSON array of 4-5 resources. Each resource MUST connect to the focused seed AND at least one other seed. No resource should only relate to a single seed.

Each item: {"type":"article|visual|music|book|concept|person","title":"...","url":"https://...","desc":"1-2 sentences explaining how this connects MULTIPLE seeds together","link":"Names which 2+ seeds this bridges and how"}

RULES:
- Real URLs from known domains (wikipedia, youtube, spotify, arxiv, goodreads, guardian, nytimes, etc)
- Every result MUST bridge 2+ seeds. If it only relates to one seed, don't include it.
- The "link" field must explicitly name which seeds are connected, e.g. "Bridges 'apple' and 'Miro' through..."
- Be surprising. The value is in connections humans wouldn't make.
- Keep descriptions SHORT. 1-2 sentences max.
- Return ONLY the JSON array. Nothing else.`;

  const singleSeedSystem = `You are a discovery engine. Given a seed idea in the "${category}" domain, find 4-5 REAL specific resources. Return ONLY a JSON array -- no markdown, no backticks, no wrapper object.

Each item: {"type":"article|visual|music|book|concept|person","title":"...","url":"https://...","desc":"1-2 sentences on why this connects","link":"how it relates to another item here"}

RULES:
- Real URLs from known domains (wikipedia, youtube, spotify, arxiv, goodreads, guardian, nytimes, etc)
- The "${category}" lens should shape your picks -- find resources that speak to this seed THROUGH ${category}
- Be surprising. Skip the obvious. Find oblique, cross-domain connections.
- Keep descriptions SHORT. 1-2 sentences max.
- Return ONLY the JSON array. Nothing else.`;

  return {
    system: isMultiSeed ? multiSeedSystem : singleSeedSystem,
    user: isMultiSeed
      ? `Find resources that connect my seeds together, focused on: "${seedText}"`
      : `Seed: "${seedText}" [category: ${category}]`
  };
}

function synthPrompt(seeds) {
  return {
    system: `You find emergent cross-connections across multiple seed ideas. Return ONLY a JSON array of synthesis objects — no markdown, no backticks.

Each: {"name":"theme name","insight":"2-3 sentences on the deep connection. Be SPECIFIC.","seeds":["seed1","seed2"],"refs":["resource title 1","resource title 2"],"leads":[{"type":"...","title":"...","url":"https://...","desc":"..."}]}

RULES:
- 2-3 syntheses max
- Each connects 2+ seeds
- leads are NEW resources no single seed would find
- Be specific not vague
- Return ONLY the JSON array`,
    user: `Seeds and resources:\n${JSON.stringify(seeds.map(s => ({
      seed: s.text, cat: s.category, resources: (s.riffs || []).map(r => ({ type: r.type, title: r.title, desc: r.desc }))
    })), null, 1)}`
  };
}

/* ── Micro Components ── */
function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {[0,1,2].map(i => <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", animation: `dot 1s ease-in-out ${i*.15}s infinite` }} />)}
    </span>
  );
}

function ResourceCard({ item, index }) {
  const safeUrl = item.url && item.url.startsWith("https://") ? item.url : null;
  return (
    <article style={{
      padding: "14px 16px", borderLeft: "3px solid #000", marginBottom: 10,
      background: "#fafafa", animation: `fadeUp 0.25s ease ${index * 0.04}s both`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{ICONS[item.type] || "\u{1F4CC}"}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#888" }}>
          {TYPE_LABELS[item.type] || item.type}
        </span>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 5, lineHeight: 1.3 }}>
        {safeUrl ? (
          <a href={safeUrl} target="_blank" rel="noopener noreferrer nofollow"
            style={{ color: "#000", textDecoration: "underline", textUnderlineOffset: 2 }}>{item.title}</a>
        ) : item.title}
      </div>
      <div style={{ fontSize: 13, color: "#444", lineHeight: 1.55 }}>{item.desc || item.description}</div>
      {(item.link || item.connection) && (
        <div style={{ fontSize: 11.5, color: "#999", fontStyle: "italic", marginTop: 6 }}>
          {"\u21B3"} {item.link || item.connection}
        </div>
      )}
    </article>
  );
}

function SynthesisCard({ syn, index }) {
  return (
    <article style={{
      padding: "18px 20px", border: "2px solid #000", marginBottom: 14,
      background: "#fff", animation: `fadeUp 0.3s ease ${index * 0.08}s both`,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{"\u{1F517}"} {syn.name}</div>
      <div style={{ fontSize: 13.5, color: "#333", lineHeight: 1.65, marginBottom: 12 }}>{syn.insight}</div>
      {syn.seeds?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          {syn.seeds.map((s, i) => (
            <span key={i} style={{ fontSize: 11, padding: "2px 8px", background: "#f0f0f0", border: "1px solid #ddd" }}>{s}</span>
          ))}
        </div>
      )}
      {syn.refs?.length > 0 && (
        <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>{syn.refs.join(" · ")}</div>
      )}
      {syn.leads?.map((lead, i) => <ResourceCard key={i} item={lead} index={i} />)}
    </article>
  );
}

function SeedItem({ seed, isSelected, onClick, onDelete }) {
  const count = seed.riffs?.length || 0;
  return (
    <div onClick={onClick} style={{
      padding: "10px 12px", cursor: "pointer",
      background: isSelected ? "#000" : "transparent",
      color: isSelected ? "#fff" : "#000",
      borderBottom: "1px solid #e8e8e8", fontSize: 13,
      display: "flex", alignItems: "center", gap: 8, transition: "all 0.1s",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, flexShrink: 0 }}>{CAT_ICONS[seed.category] || "\u25CF"}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
            {seed.text}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: isSelected ? "#aaa" : "#999", marginTop: 2, paddingLeft: 22 }}>
          {seed.category}{count > 0 ? ` · ${count} found` : ""}
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{
        background: "none", border: "none", cursor: "pointer",
        color: isSelected ? "#777" : "#ccc", fontSize: 15, lineHeight: 1, flexShrink: 0,
        display: "flex", alignItems: "center",
      }}><svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" fill="none"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg></button>
    </div>
  );
}

/* Small button style helper */
const smallBtn = (active = true) => ({
  background: "none", border: "1px solid #ddd", padding: "4px 10px",
  fontSize: 11, cursor: active ? "pointer" : "default",
  color: active ? "#666" : "#ccc", fontFamily: "inherit",
  transition: "all 0.1s",
});

/* ── Main App ── */
export default function RiffMachine() {
  const [seeds, setSeeds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [syntheses, setSyntheses] = useState([]);
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("art");
  const [loading, setLoading] = useState(false);
  const [synthLoading, setSynthLoading] = useState(false);
  const [streamItems, setStreamItems] = useState([]);
  const [error, setError] = useState(null);
  const [view, setView] = useState("riffs");
  const [filter, setFilter] = useState("all");
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    loadState().then(s => {
      if (s) {
        const migrated = (s.seeds || []).map(sd => {
          let riffs = sd.riffs || sd.categories || [];
          if (!Array.isArray(riffs)) riffs = [];
          riffs = riffs.filter(r => r != null && (typeof r === "object" || typeof r === "string"));
          riffs = riffs.map(r => typeof r === "string" ? { type: "concept", title: r, desc: r } : r);
          return { ...sd, category: sd.category || "art", riffs };
        });
        setSeeds(migrated);
        setSyntheses(s.syntheses || []);
        if (s.selectedId) setSelectedId(s.selectedId);
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) saveState({ seeds, selectedId, syntheses });
  }, [seeds, selectedId, syntheses, ready]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const selected = seeds.find(s => s.id === selectedId);
  const seedsWithRiffs = seeds.filter(s => s.riffs?.length > 0).length;

  const addSeed = useCallback(() => {
    const t = sanitiseInput(input);
    if (!t) return;
    const ns = { id: Date.now().toString(), text: t, category, riffs: [] };
    setSeeds(p => [ns, ...p]);
    setSelectedId(ns.id);
    setInput("");
    setView("riffs");
    setFilter("all");
    inputRef.current?.focus();
  }, [input, category]);

  const deleteSeed = useCallback(id => {
    setSeeds(p => p.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const riff = useCallback(async () => {
    if (!selected || loading) return;
    setLoading(true); setError(null); setView("riffs"); setStreamItems([]);
    abortRef.current = new AbortController();
    try {
      const { system, user } = riffPrompt(selected, seeds);
      const fullText = await streamAPI(system, user, (partial) => {
        setStreamItems(extractItems(partial));
      }, abortRef.current.signal);
      let items = extractItems(fullText);
      if (items.length === 0) {
        try {
          const cleaned = fullText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          const parsed = JSON.parse(cleaned);
          items = Array.isArray(parsed) ? parsed : (parsed.categories || []);
        } catch {}
      }
      if (items.length === 0) throw new Error("No resources found — try riffing again");
      setSeeds(p => p.map(s => s.id === selected.id ? { ...s, riffs: [...(s.riffs || []), ...items] } : s));
      setStreamItems([]);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally { setLoading(false); }
  }, [selected, loading]);

  const synthesize = useCallback(async () => {
    const withRiffs = seeds.filter(s => s.riffs?.length > 0);
    if (seeds.length < 2 || synthLoading) return;
    const toSynth = withRiffs.length >= 2 ? withRiffs : seeds;
    setSynthLoading(true); setError(null); setView("synthesis");
    try {
      const { system, user } = synthPrompt(toSynth);
      const fullText = await streamAPI(system, user, () => {}, new AbortController().signal);
      let parsed;
      try {
        const cleaned = fullText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        const match = fullText.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Could not parse synthesis");
      }
      setSyntheses(Array.isArray(parsed) ? parsed : (parsed.syntheses || []));
    } catch (e) { setError(e.message); }
    finally { setSynthLoading(false); }
  }, [seeds, synthLoading]);

  const clearRiffs = useCallback(() => {
    if (!selected) return;
    setSeeds(p => p.map(s => s.id === selected.id ? { ...s, riffs: [] } : s));
  }, [selected]);

  /* ── Export handlers ── */
  const handleExportSeed = useCallback(() => {
    if (!selected) return;
    const md = exportSeedMarkdown(selected);
    const filename = `riff-${selected.text.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-")}.md`;
    downloadMarkdown(filename, md);
  }, [selected]);

  const handleExportAll = useCallback(() => {
    const md = exportAllMarkdown(seeds, syntheses);
    downloadMarkdown(`riff-machine-export-${Date.now()}.md`, md);
  }, [seeds, syntheses]);

  const handleCopySeed = useCallback(async () => {
    if (!selected) return;
    const md = exportSeedMarkdown(selected);
    await copyToClipboard(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selected]);

  const handleCopyAll = useCallback(async () => {
    const md = exportAllMarkdown(seeds, syntheses);
    await copyToClipboard(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [seeds, syntheses]);

  const handleReset = useCallback(() => {
    if (!window.confirm("Clear all seeds, riffs, and syntheses? This can’t be undone.")) return;
    setSeeds([]);
    setSyntheses([]);
    setSelectedId(null);
    setView("riffs");
    setFilter("all");
    saveState({ seeds: [], selectedId: null, syntheses: [] });
  }, []);

  const committedRiffs = selected?.riffs || [];
  const displayRiffs = loading ? [...committedRiffs, ...streamItems] : committedRiffs;
  const types = ["all", ...new Set(displayRiffs.map(r => r.type).filter(Boolean))];
  const filtered = filter === "all" ? displayRiffs : displayRiffs.filter(r => r.type === filter);

  const selectSeed = useCallback((id) => {
    setSelectedId(id);
    setView("riffs");
    setFilter("all");
  }, []);

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .rm-seed-chips::-webkit-scrollbar { display: none; }
          .rm-seed-chips { -ms-overflow-style: none; scrollbar-width: none; }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100vh", width: "100%", overflow: "hidden" }}>

        {/* ── Sidebar (desktop) / Top section (mobile) ── */}
        <nav style={isMobile
          ? { borderBottom: "1px solid #e0e0e0", flexShrink: 0 }
          : { width: 280, minWidth: 280, borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column", height: "100%" }
        }>
          {/* Title + Input */}
          <div style={{ padding: isMobile ? "12px 12px 8px" : "16px 12px 12px", borderBottom: isMobile ? "none" : "1px solid #e0e0e0" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
              Riff Machine
            </div>
            <div style={{ fontSize: 12, color: "#999", fontWeight: 400, marginBottom: isMobile ? 8 : 12 }}>
              Pick a category, type an idea, hit Riff.
            </div>

            {isMobile ? (
              <div style={{ display: "flex", gap: 5 }}>
                <select value={category} onChange={e => setCategory(e.target.value)} style={{
                  padding: "7px 4px", border: "1px solid #ccc", borderRadius: 0,
                  fontSize: 13, fontFamily: "inherit", background: "#fff",
                  cursor: "pointer", appearance: "auto", minHeight: 44, width: 52,
                }}>
                  {SEED_CATEGORIES.map(c => (
                    <option key={c} value={c}>{CAT_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
                <input ref={inputRef} value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addSeed()}
                  placeholder="Enter a seed idea…"
                  style={{ flex: 1, padding: "7px 10px", border: "1px solid #ccc", borderRadius: 0, fontSize: 13, fontFamily: "inherit", minHeight: 44, minWidth: 0 }}
                />
                <button onClick={addSeed} disabled={!input.trim()} style={{
                  padding: "7px 11px", background: input.trim() ? "#000" : "#ddd",
                  color: "#fff", border: "none", fontSize: 14, cursor: input.trim() ? "pointer" : "default",
                  fontFamily: "inherit", fontWeight: 600, minHeight: 44,
                }}>+</button>
              </div>
            ) : (
              <>
                <select value={category} onChange={e => setCategory(e.target.value)} style={{
                  width: "100%", padding: "7px 8px", marginBottom: 8,
                  border: "1px solid #ccc", borderRadius: 0, fontSize: 13,
                  fontFamily: "inherit", background: "#fff", cursor: "pointer", appearance: "auto",
                }}>
                  {SEED_CATEGORIES.map(c => (
                    <option key={c} value={c}>{CAT_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 5 }}>
                  <input ref={inputRef} value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addSeed()}
                    placeholder="Enter a seed idea…"
                    style={{ flex: 1, padding: "7px 10px", border: "1px solid #ccc", borderRadius: 0, fontSize: 13, fontFamily: "inherit" }}
                  />
                  <button onClick={addSeed} disabled={!input.trim()} style={{
                    padding: "7px 11px", background: input.trim() ? "#000" : "#ddd",
                    color: "#fff", border: "none", fontSize: 14, cursor: input.trim() ? "pointer" : "default",
                    fontFamily: "inherit", fontWeight: 600,
                  }}>+</button>
                </div>
              </>
            )}
          </div>

          {/* Seeds list */}
          {isMobile ? (
            seeds.length > 0 && (
              <div className="rm-seed-chips" style={{
                display: "flex", gap: 6, padding: "8px 12px",
                overflowX: "auto",
              }}>
                {seeds.map(seed => (
                  <button key={seed.id}
                    onClick={() => selectSeed(seed.id)}
                    style={{
                      padding: "8px 14px", fontSize: 12, whiteSpace: "nowrap",
                      background: seed.id === selectedId ? "#000" : "#f5f5f5",
                      color: seed.id === selectedId ? "#fff" : "#000",
                      border: "none", borderRadius: 20, cursor: "pointer",
                      minHeight: 44, display: "flex", alignItems: "center", gap: 5,
                      flexShrink: 0, fontFamily: "inherit", fontWeight: 500,
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{CAT_ICONS[seed.category] || "\u25CF"}</span>
                    <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {seed.text}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {seeds.map(seed => (
                <SeedItem key={seed.id} seed={seed} isSelected={seed.id === selectedId}
                  onClick={() => selectSeed(seed.id)}
                  onDelete={() => deleteSeed(seed.id)} />
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{
            padding: 10,
            borderTop: isMobile ? "none" : "1px solid #e0e0e0",
            display: "flex",
            flexDirection: isMobile ? "row" : "column",
            gap: 5,
            flexWrap: isMobile ? "wrap" : "nowrap",
          }}>
            <button onClick={riff} disabled={!selected || loading} style={{
              flex: isMobile ? "1 1 45%" : undefined,
              width: isMobile ? undefined : "100%",
              padding: "10px 14px",
              background: !selected || loading ? "#e8e8e8" : "#000",
              color: !selected || loading ? "#aaa" : "#fff",
              border: "none", fontSize: 12, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              cursor: !selected || loading ? "default" : "pointer", fontFamily: "inherit",
              minHeight: isMobile ? 44 : undefined,
            }}>{loading ? <Dots /> : "Riff"}</button>

            <button onClick={synthesize} disabled={seeds.length < 2 || synthLoading} style={{
              flex: isMobile ? "1 1 45%" : undefined,
              width: isMobile ? undefined : "100%",
              padding: "10px 14px", background: "transparent",
              color: seeds.length < 2 || synthLoading ? "#ccc" : "#000",
              border: `1px solid ${seeds.length < 2 || synthLoading ? "#e0e0e0" : "#000"}`,
              fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              cursor: seeds.length < 2 || synthLoading ? "default" : "pointer", fontFamily: "inherit",
              minHeight: isMobile ? 44 : undefined,
            }}>{synthLoading ? <Dots /> : `Synthesize${seeds.length >= 2 ? ` (${seeds.length})` : ""}`}</button>

            <div style={{ display: "flex", gap: 4, marginTop: 2, flex: isMobile ? "1 1 100%" : undefined }}>
              <button onClick={handleExportAll} disabled={seeds.length === 0} style={{
                ...smallBtn(seeds.length > 0), flex: 1, minHeight: isMobile ? 44 : undefined,
              }}>Export All</button>
              <button onClick={handleCopyAll} disabled={seeds.length === 0} style={{
                ...smallBtn(seeds.length > 0), flex: 1, minHeight: isMobile ? 44 : undefined,
              }}>{copied ? "Copied!" : "Copy MD"}</button>
            </div>
            <button onClick={handleReset} style={{
              background: "none", border: "none", padding: "4px 0",
              fontSize: 11, color: "#bbb", textTransform: "uppercase",
              letterSpacing: "0.06em", cursor: "pointer", fontFamily: "inherit",
              marginTop: 8, textAlign: "center", width: "100%",
              flex: isMobile ? "1 1 100%" : undefined,
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "#999"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#bbb"; }}
            >Reset</button>
          </div>
        </nav>

        {/* ── Main Panel ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Tab bar */}
          {(selected || syntheses.length > 0) && (
            <div style={{
              display: "flex", borderBottom: "1px solid #e0e0e0",
              padding: isMobile ? "0" : "0 24px",
              justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ display: "flex", flex: isMobile ? 1 : undefined }}>
                {selected && (
                  <button onClick={() => setView("riffs")} style={{
                    padding: "11px 16px", fontSize: 11.5, fontWeight: 700,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    background: "none", border: "none", cursor: "pointer",
                    borderBottom: view === "riffs" ? "2px solid #000" : "2px solid transparent",
                    color: view === "riffs" ? "#000" : "#999", fontFamily: "inherit",
                    flex: isMobile ? 1 : undefined, minHeight: isMobile ? 44 : undefined,
                  }}>Resources</button>
                )}
                <button onClick={() => setView("synthesis")} style={{
                  padding: "11px 16px", fontSize: 11.5, fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  background: "none", border: "none", cursor: "pointer",
                  borderBottom: view === "synthesis" ? "2px solid #000" : "2px solid transparent",
                  color: view === "synthesis" ? "#000" : "#999", fontFamily: "inherit",
                  flex: isMobile ? 1 : undefined, minHeight: isMobile ? 44 : undefined,
                }}>Synthesis {syntheses.length > 0 && `(${syntheses.length})`}</button>
              </div>
              {/* Per-seed export — desktop only in tab bar */}
              {!isMobile && view === "riffs" && selected?.riffs?.length > 0 && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={handleExportSeed} style={smallBtn()}>Export .md</button>
                  <button onClick={handleCopySeed} style={smallBtn()}>{copied ? "Copied!" : "Copy"}</button>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          {!selected && view !== "synthesis" ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb", fontSize: 14 }}>
              Select a seed and hit Riff
            </div>
          ) : view === "riffs" && selected ? (
            <>
              <div style={{
                padding: isMobile ? "12px 16px 10px" : "14px 24px 10px",
                borderBottom: "1px solid #f0f0f0",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13 }}>{CAT_ICONS[selected.category] || "\u25CF"}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#aaa" }}>
                        {selected.category}
                      </span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{selected.text}</div>
                  </div>
                  {committedRiffs.length > 0 && (
                    <button onClick={clearRiffs} style={smallBtn()}>Clear</button>
                  )}
                </div>
                {/* Per-seed export — mobile: below header */}
                {isMobile && selected?.riffs?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button onClick={handleExportSeed} style={{ ...smallBtn(), minHeight: 44 }}>Export .md</button>
                    <button onClick={handleCopySeed} style={{ ...smallBtn(), minHeight: 44 }}>{copied ? "Copied!" : "Copy"}</button>
                  </div>
                )}
              </div>

              {types.length > 2 && (
                <div style={{ padding: isMobile ? "8px 16px" : "8px 24px", display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid #f0f0f0" }}>
                  {types.map(t => (
                    <button key={t} onClick={() => setFilter(t)} style={{
                      padding: isMobile ? "8px 12px" : "3px 9px", fontSize: 11, fontWeight: 600,
                      background: filter === t ? "#000" : "#f5f5f5",
                      color: filter === t ? "#fff" : "#666",
                      border: "none", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                      minHeight: isMobile ? 44 : undefined,
                    }}>{t === "all" ? `All (${displayRiffs.length})` : `${ICONS[t] || ""} ${t}`}</button>
                  ))}
                </div>
              )}

              <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 16px" : "16px 24px" }}>
                {error && (
                  <div style={{ padding: "10px 14px", background: "#fff5f5", border: "1px solid #fcc", color: "#c00", fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>{error}</div>
                )}
                {filtered.length === 0 && !loading && (
                  <div style={{ color: "#bbb", fontSize: 13, paddingTop: 24, textAlign: "center" }}>
                    Hit Riff to discover resources through the {selected.category} lens
                  </div>
                )}
                {filtered.map((item, i) => <ResourceCard key={`${selected.id}-${i}-${item.title}`} item={item} index={i} />)}
                {loading && filtered.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#999", fontSize: 13 }}>{"Discovering…"} <Dots /></div>
                )}
              </div>
            </>
          ) : view === "synthesis" ? (
            <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px" : "20px 28px" }}>
              {error && (
                <div style={{ padding: "10px 14px", background: "#fff5f5", border: "1px solid #fcc", color: "#c00", fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>{error}</div>
              )}
              {syntheses.length === 0 && !synthLoading && (
                <div style={{ color: "#bbb", fontSize: 13, paddingTop: 24, textAlign: "center", lineHeight: 1.7 }}>
                  {seedsWithRiffs < 2 ? "Riff on 2+ seeds, then Synthesize" : "Hit Synthesize to find cross-connections"}
                </div>
              )}
              {syntheses.map((syn, i) => <SynthesisCard key={i} syn={syn} index={i} />)}
              {synthLoading && <div style={{ textAlign: "center", padding: "24px 0", color: "#999", fontSize: 13 }}>{"Synthesizing…"} <Dots /></div>}
            </div>
          ) : null}
        </main>
      </div>
    </>
  );
}
