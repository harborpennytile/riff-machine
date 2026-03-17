"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import storage from "@/lib/storage";
import { exportSeedMarkdown, exportAllMarkdown, downloadMarkdown, copyToClipboard } from "@/lib/export";

const API_URL = "/api/riff";
const MODEL = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const STORAGE_KEY = "riffmachine:v4";

const CATEGORIES = [
  { id: "art", icon: "\u{1F3A8}", label: "Art" },
  { id: "music", icon: "\u{1F3B6}", label: "Music" },
  { id: "tech", icon: "\u{26A1}", label: "Tech" },
  { id: "philosophy", icon: "\u{1F9E0}", label: "Philosophy" },
  { id: "finance", icon: "\u{1F4B0}", label: "Finance" },
  { id: "food", icon: "\u{1F373}", label: "Food" },
  { id: "nature", icon: "\u{1F33F}", label: "Nature" },
  { id: "news", icon: "\u{1F4F0}", label: "News" },
  { id: "random", icon: "\u{1F3B2}", label: "Random" },
  { id: "other", icon: "\u{2726}", label: "Other" },
];

const TYPE_ICONS = {
  article: "\u{1F4C4}", visual: "\u{1F5BC}", music: "\u{1F3B5}",
  book: "\u{1F4D6}", concept: "\u{1F4A1}", person: "\u{1F464}",
};

function catIcon(id) {
  return CATEGORIES.find(c => c.id === id)?.icon || "";
}

function sanitise(text) {
  return text.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "").replace(/on\w+\s*=/gi, "")
    .replace(/[{}<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
}

/* -- Storage -- */
async function loadState() {
  for (const key of [STORAGE_KEY, "riffmachine:v3", "riffmachine:v2", "riffmachine:state"]) {
    try {
      const r = await storage.get(key);
      if (r?.value) { const p = JSON.parse(r.value); if (p?.seeds?.length) return p; }
    } catch {}
  }
  return null;
}
async function saveState(s) { try { await storage.set(STORAGE_KEY, JSON.stringify(s)); } catch {} }

/* -- Streaming -- */
async function streamAPI(system, userMsg, onChunk, signal) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, stream: true, system, messages: [{ role: "user", content: userMsg }] }),
    signal,
  });
  if (!res.ok) throw new Error("API error " + res.status);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() || "";
    for (const ln of lines) {
      if (!ln.startsWith("data: ")) continue;
      const d = ln.slice(6).trim();
      if (d === "[DONE]") continue;
      try { const e = JSON.parse(d); if (e.type === "content_block_delta" && e.delta?.text) { full += e.delta.text; onChunk(full); } } catch {}
    }
  }
  return full;
}

function extractItems(text) {
  const items = [];
  const re = /\{[^{}]*"type"\s*:\s*"[^"]+?"[^{}]*"title"\s*:\s*"[^"]*?"[^{}]*\}/g;
  let m;
  while ((m = re.exec(text)) !== null) { try { const o = JSON.parse(m[0]); if (o.type && o.title) items.push(o); } catch {} }
  return items;
}

/* -- Prompts -- */
function buildRiffPrompt(seed, allSeeds) {
  const others = allSeeds.filter(s => s.id !== seed.id);
  const hasOthers = others.length > 0;

  let ctx = "";
  if (hasOthers) {
    ctx = "\n\nThe user's full seed collection:\n" +
      allSeeds.map(s => {
        const titles = (s.riffs || []).map(r => r.title).filter(Boolean).slice(0, 5);
        return `- [${s.category}] "${s.text}"${titles.length ? " (found: " + titles.join(", ") + ")" : ""}`;
      }).join("\n");
  }

  const crossRule = hasOthers
    ? `\nCRITICAL: Every result MUST bridge the focused seed with at least one other seed from the collection. In the "link" field, name which seeds connect and how. Do NOT return results about only one seed.`
    : `\nFind diverse, cross-domain resources for this seed.`;

  return {
    system: `You are a creative discovery engine that finds unexpected connections across ideas.

The user is focused on: "${seed.text}" [${seed.category}]${ctx}

Return ONLY a JSON array of 4-5 items. No markdown, no backticks, no wrapper.

Each item: {"type":"article|visual|music|book|concept|person","title":"Specific real title","search":"precise Google search query to find this exact resource","desc":"1-2 sentences on how this connects multiple seeds","link":"Which seeds this bridges and how"}

RULES:
- Do NOT include a "url" field. Include a "search" field with a precise search query (e.g. "John Cage Atlas Eclipticalis mushroom foraging composition" not just "John Cage").
- The title must be a real, specific work, article, book, song, person, or concept.
- Keep descriptions to 1-2 sentences.${crossRule}
- Be surprising. Find oblique, non-obvious connections.`,
    user: `Find resources connecting my seeds, focused on: "${seed.text}"`,
  };
}

function buildSynthPrompt(seeds) {
  return {
    system: `You find emergent cross-connections across seed ideas. Return ONLY a JSON array. No markdown, no backticks.

Each: {"name":"theme","insight":"2-3 specific sentences","seeds":["seed1","seed2"],"refs":["resource title"],"leads":[{"type":"...","title":"...","search":"google search query","desc":"..."}]}

RULES: 2-3 syntheses. Each connects 2+ seeds. Leads are NEW resources no single seed would find. Be specific. No url field, use search field instead.`,
    user: `Seeds:\n${JSON.stringify(seeds.map(s => ({ seed: s.text, cat: s.category, resources: (s.riffs || []).map(r => ({ type: r.type, title: r.title, desc: r.desc })) })), null, 1)}`,
  };
}

/* -- Hook -- */
function useIsMobile(bp = 768) {
  const [m, setM] = useState(false);
  useEffect(() => { const c = () => setM(window.innerWidth < bp); c(); window.addEventListener("resize", c); return () => window.removeEventListener("resize", c); }, [bp]);
  return m;
}

/* -- Shared Sub-Components -- */

function SearchLink({ title, search }) {
  const q = search || title;
  const href = "https://www.google.com/search?q=" + encodeURIComponent(q);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontWeight: 600 }}>{title}</span>
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" title={"Search: " + q}
        style={{ color: "#999", fontSize: 11, textDecoration: "none", border: "1px solid #ddd", borderRadius: 3, padding: "1px 6px", whiteSpace: "nowrap" }}>
        search
      </a>
    </span>
  );
}

function ResourceCard({ item, idx }) {
  return (
    <article style={{ padding: "14px 16px", borderLeft: "3px solid #000", marginBottom: 10, background: "#fafafa", animation: "fadeUp 0.25s ease " + (idx * 0.04) + "s both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>{TYPE_ICONS[item.type] || ""}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#888" }}>{item.type}</span>
      </div>
      <div style={{ fontSize: 14.5, marginBottom: 5, lineHeight: 1.3 }}>
        <SearchLink title={item.title} search={item.search} />
      </div>
      <div style={{ fontSize: 13, color: "#444", lineHeight: 1.55 }}>{item.desc || item.description || ""}</div>
      {(item.link || item.connection) && (
        <div style={{ fontSize: 11.5, color: "#999", fontStyle: "italic", marginTop: 6 }}>
          {">> "}{item.link || item.connection}
        </div>
      )}
    </article>
  );
}

function SynthCard({ syn, idx }) {
  return (
    <article style={{ padding: "18px 20px", border: "2px solid #000", marginBottom: 14, background: "#fff", animation: "fadeUp 0.3s ease " + (idx * 0.08) + "s both" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{syn.name}</div>
      <div style={{ fontSize: 13.5, color: "#333", lineHeight: 1.65, marginBottom: 12 }}>{syn.insight}</div>
      {syn.seeds?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          {syn.seeds.map((s, i) => <span key={i} style={{ fontSize: 11, padding: "2px 8px", background: "#f0f0f0", border: "1px solid #ddd" }}>{s}</span>)}
        </div>
      )}
      {syn.refs?.length > 0 && <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>{syn.refs.join(" - ")}</div>}
      {syn.leads?.map((lead, i) => <ResourceCard key={i} item={lead} idx={i} />)}
    </article>
  );
}

function ResultsContent({ selected, displayRiffs, filtered, types, filter, setFilter, syntheses, view, loading, synthLoading, error, clearRiffs, doExportSeed, doCopy, copied, seedsWithRiffs, isMobile }) {
  if (view === "riffs" && selected) {
    return (
      <>
        {/* Seed header */}
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 13 }}>{catIcon(selected.category)}</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#aaa" }}>{selected.category}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{selected.text}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(selected.riffs?.length > 0) && <>
              <button onClick={doExportSeed} style={tinyBtn}>Export .md</button>
              <button onClick={() => doCopy(false)} style={tinyBtn}>{copied ? "Done" : "Copy"}</button>
              <button onClick={clearRiffs} style={tinyBtn}>Clear</button>
            </>}
          </div>
        </div>

        {/* Type filters */}
        {types.length > 2 && (
          <div style={{ padding: "8px 16px", display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid #f0f0f0" }}>
            {types.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                padding: "3px 9px", fontSize: 11, fontWeight: 600,
                background: filter === t ? "#000" : "#f5f5f5", color: filter === t ? "#fff" : "#666",
                border: "none", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
              }}>{t === "all" ? "All (" + displayRiffs.length + ")" : (TYPE_ICONS[t] || "") + " " + t}</button>
            ))}
          </div>
        )}

        {/* Results */}
        <div style={{ padding: "16px" }}>
          {error && <div style={{ padding: "10px 14px", background: "#fff5f5", border: "1px solid #fcc", color: "#c00", fontSize: 12.5, marginBottom: 14 }}>{error}</div>}
          {filtered.length === 0 && !loading && <div style={{ color: "#bbb", fontSize: 13, paddingTop: 20, textAlign: "center" }}>Hit Riff to discover cross-connections</div>}
          {filtered.map((item, i) => <ResourceCard key={selected.id + "-" + i} item={item} idx={i} />)}
          {loading && filtered.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: "#999", fontSize: 13 }}>Discovering...</div>}
        </div>
      </>
    );
  }

  if (view === "synthesis") {
    return (
      <div style={{ padding: "16px" }}>
        {error && <div style={{ padding: "10px 14px", background: "#fff5f5", border: "1px solid #fcc", color: "#c00", fontSize: 12.5, marginBottom: 14 }}>{error}</div>}
        {syntheses.length === 0 && !synthLoading && <div style={{ color: "#bbb", fontSize: 13, paddingTop: 20, textAlign: "center" }}>{seedsWithRiffs < 2 ? "Riff on 2+ seeds, then Synthesize" : "Hit Synthesize to find cross-connections"}</div>}
        {syntheses.map((syn, i) => <SynthCard key={i} syn={syn} idx={i} />)}
        {synthLoading && <div style={{ textAlign: "center", padding: "20px 0", color: "#999", fontSize: 13 }}>Synthesizing...</div>}
      </div>
    );
  }

  return <div style={{ padding: "40px 16px", textAlign: "center", color: "#bbb", fontSize: 14 }}>Select a seed and hit Riff</div>;
}

const tinyBtn = { background: "none", border: "1px solid #ddd", padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "#666", fontFamily: "inherit" };

/* ========== MAIN COMPONENT ========== */

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
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    loadState().then(s => {
      if (s) {
        const mig = (s.seeds || []).map(sd => {
          let riffs = sd.riffs || sd.categories || [];
          if (!Array.isArray(riffs)) riffs = [];
          riffs = riffs.filter(r => r != null && typeof r === "object").map(r => typeof r === "string" ? { type: "concept", title: r, desc: r } : r);
          return { ...sd, category: sd.category || "art", riffs };
        });
        setSeeds(mig); setSyntheses(s.syntheses || []);
        if (s.selectedId) setSelectedId(s.selectedId);
      }
      setReady(true);
    });
  }, []);

  useEffect(() => { if (ready) saveState({ seeds, selectedId, syntheses }); }, [seeds, selectedId, syntheses, ready]);

  const selected = seeds.find(s => s.id === selectedId);
  const seedsWithRiffs = seeds.filter(s => s.riffs?.length > 0).length;

  const addSeed = useCallback(() => {
    const t = sanitise(input); if (!t) return;
    const ns = { id: Date.now().toString(), text: t, category, riffs: [] };
    setSeeds(p => [ns, ...p]); setSelectedId(ns.id); setInput(""); setView("riffs"); setFilter("all");
    inputRef.current?.focus();
  }, [input, category]);

  const deleteSeed = useCallback(id => {
    setSeeds(prev => {
      const updated = prev.filter(s => s.id !== id);
      if (selectedId === id) {
        const oldIdx = prev.findIndex(s => s.id === id);
        const next = updated[Math.min(oldIdx, updated.length - 1)];
        setSelectedId(next?.id || null);
      }
      return updated;
    });
  }, [selectedId]);

  const riff = useCallback(async () => {
    if (!selected || loading) return;
    setLoading(true); setError(null); setView("riffs"); setStreamItems([]);
    abortRef.current = new AbortController();
    try {
      const { system, user } = buildRiffPrompt(selected, seeds);
      const full = await streamAPI(system, user, p => setStreamItems(extractItems(p)), abortRef.current.signal);
      let items = extractItems(full);
      if (!items.length) { try { items = JSON.parse(full.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()); if (!Array.isArray(items)) items = items.categories || []; } catch { items = []; } }
      if (!items.length) throw new Error("No resources found - try again");
      setSeeds(p => p.map(s => s.id === selected.id ? { ...s, riffs: [...(s.riffs || []), ...items] } : s));
      setStreamItems([]);
    } catch (e) { if (e.name !== "AbortError") setError(e.message); }
    finally { setLoading(false); }
  }, [selected, loading, seeds]);

  const synthesize = useCallback(async () => {
    if (seeds.length < 2 || synthLoading) return;
    const toSynth = seeds.filter(s => s.riffs?.length > 0);
    const input = toSynth.length >= 2 ? toSynth : seeds;
    setSynthLoading(true); setError(null); setView("synthesis");
    try {
      const { system, user } = buildSynthPrompt(input);
      const full = await streamAPI(system, user, () => {}, new AbortController().signal);
      let parsed; try { parsed = JSON.parse(full.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()); } catch { const m = full.match(/\[[\s\S]*\]/); if (m) parsed = JSON.parse(m[0]); else throw new Error("Parse error"); }
      setSyntheses(Array.isArray(parsed) ? parsed : (parsed.syntheses || []));
    } catch (e) { setError(e.message); }
    finally { setSynthLoading(false); }
  }, [seeds, synthLoading]);

  const clearRiffs = useCallback(() => { if (selected) setSeeds(p => p.map(s => s.id === selected.id ? { ...s, riffs: [] } : s)); }, [selected]);

  const handleReset = useCallback(() => {
    if (window.confirm("Clear all seeds, riffs, and syntheses?")) {
      setSeeds([]); setSyntheses([]); setSelectedId(null); setView("riffs"); setFilter("all");
      saveState({ seeds: [], selectedId: null, syntheses: [] });
    }
  }, []);

  const doExportSeed = useCallback(() => { if (selected) downloadMarkdown("riff-" + selected.text.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-") + ".md", exportSeedMarkdown(selected)); }, [selected]);
  const doExportAll = useCallback(() => { downloadMarkdown("riff-export.md", exportAllMarkdown(seeds, syntheses)); }, [seeds, syntheses]);
  const doCopy = useCallback(async (all) => {
    const md = all ? exportAllMarkdown(seeds, syntheses) : (selected ? exportSeedMarkdown(selected) : "");
    await copyToClipboard(md); setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [seeds, syntheses, selected]);

  // Derived
  const committed = selected?.riffs || [];
  const displayRiffs = loading ? [...committed, ...streamItems] : committed;
  const types = ["all", ...new Set(displayRiffs.map(r => r.type).filter(Boolean))];
  const filtered = filter === "all" ? displayRiffs : displayRiffs.filter(r => r.type === filter);

  const tabBar = (
    <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0", flexShrink: 0 }}>
      <button onClick={() => setView("riffs")} style={{ flex: 1, padding: "12px", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: "none", border: "none", borderBottom: view === "riffs" ? "2px solid #000" : "2px solid transparent", color: view === "riffs" ? "#000" : "#999", fontFamily: "inherit", cursor: "pointer", minHeight: 44 }}>Resources</button>
      <button onClick={() => setView("synthesis")} style={{ flex: 1, padding: "12px", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: "none", border: "none", borderBottom: view === "synthesis" ? "2px solid #000" : "2px solid transparent", color: view === "synthesis" ? "#000" : "#999", fontFamily: "inherit", cursor: "pointer", minHeight: 44 }}>Synthesis{syntheses.length > 0 ? " (" + syntheses.length + ")" : ""}</button>
    </div>
  );

  const resultsProps = { selected, displayRiffs, filtered, types, filter, setFilter, syntheses, view, loading, synthLoading, error, clearRiffs, doExportSeed, doCopy, copied, seedsWithRiffs, isMobile };

  /* =================== MOBILE =================== */
  if (isMobile) {
    return (
      <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", background: "#fff", color: "#000", minHeight: "100vh", minHeight: "100dvh" }}>
        <style>{cssBlock}</style>

        {/* Header */}
        <div style={{ padding: "14px 16px 8px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>Riff Machine</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Pick a category, type an idea, hit Riff.</div>
        </div>

        {/* Category */}
        <div style={{ padding: "6px 16px" }}>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 0, fontSize: 14, fontFamily: "inherit", background: "#fff", minHeight: 44, WebkitAppearance: "auto", appearance: "auto" }}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
        </div>

        {/* Input */}
        <div style={{ padding: "6px 16px", display: "flex", gap: 8 }}>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addSeed()}
            placeholder="Enter a seed idea..." style={{ flex: 1, padding: "10px 12px", border: "1px solid #ccc", borderRadius: 0, fontSize: 14, fontFamily: "inherit", minHeight: 44 }} />
          <button onClick={addSeed} disabled={!input.trim()} style={{ padding: "10px 16px", background: input.trim() ? "#000" : "#ddd", color: "#fff", border: "none", fontSize: 16, fontWeight: 600, minHeight: 44, minWidth: 44 }}>+</button>
        </div>

        {/* Seed chips */}
        {seeds.length > 0 && (
          <div style={{ display: "flex", gap: 8, padding: "10px 16px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {seeds.map(seed => (
              <button key={seed.id} onClick={() => { setSelectedId(seed.id); setView("riffs"); setFilter("all"); }}
                style={{ flexShrink: 0, padding: "8px 14px", fontSize: 13, background: seed.id === selectedId ? "#000" : "#f0f0f0", color: seed.id === selectedId ? "#fff" : "#000", border: "none", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", minHeight: 36 }}>
                {catIcon(seed.category)} {seed.text.length > 18 ? seed.text.slice(0, 18) + "..." : seed.text}
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={riff} disabled={!selected || loading} style={{ flex: 1, padding: "12px", background: !selected || loading ? "#e8e8e8" : "#000", color: !selected || loading ? "#aaa" : "#fff", border: "none", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "inherit", minHeight: 44 }}>{loading ? "..." : "RIFF"}</button>
            <button onClick={synthesize} disabled={seeds.length < 2 || synthLoading} style={{ flex: 1, padding: "12px", background: "transparent", color: seeds.length < 2 || synthLoading ? "#ccc" : "#000", border: "1px solid " + (seeds.length < 2 || synthLoading ? "#e0e0e0" : "#000"), fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "inherit", minHeight: 44 }}>{synthLoading ? "..." : "SYNTH"}</button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={doExportAll} style={{ flex: 1, padding: "10px", background: "none", border: "1px solid #ddd", fontSize: 12, fontFamily: "inherit", color: "#666", minHeight: 44 }}>Export All</button>
            <button onClick={() => doCopy(true)} style={{ flex: 1, padding: "10px", background: "none", border: "1px solid #ddd", fontSize: 12, fontFamily: "inherit", color: "#666", minHeight: 44 }}>{copied ? "Done" : "Copy MD"}</button>
          </div>
          <button onClick={handleReset} style={{ background: "none", border: "none", fontSize: 11, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px", fontFamily: "inherit", cursor: "pointer" }}>RESET</button>
        </div>

        {/* Tabs + Results */}
        {tabBar}
        <ResultsContent {...resultsProps} />
      </div>
    );
  }

  /* =================== DESKTOP =================== */
  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", background: "#fff", color: "#000", overflow: "hidden" }}>
      <style>{cssBlock}</style>

      {/* Sidebar */}
      <nav style={{ width: 260, minWidth: 260, borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Top: title + inputs */}
        <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid #e0e0e0" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>Riff Machine</div>
          <div style={{ fontSize: 11.5, color: "#999", marginBottom: 12 }}>Pick a category, type an idea, hit Riff.</div>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: "100%", padding: "7px 8px", marginBottom: 8, border: "1px solid #ccc", borderRadius: 0, fontSize: 13, fontFamily: "inherit", background: "#fff", cursor: "pointer", appearance: "auto" }}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          <div style={{ display: "flex", gap: 5 }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addSeed()}
              placeholder="Enter a seed idea..." style={{ flex: 1, padding: "7px 10px", border: "1px solid #ccc", borderRadius: 0, fontSize: 13, fontFamily: "inherit" }} />
            <button onClick={addSeed} disabled={!input.trim()} style={{ padding: "7px 11px", background: input.trim() ? "#000" : "#ddd", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: input.trim() ? "pointer" : "default" }}>+</button>
          </div>
        </div>

        {/* Seeds list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {seeds.map(seed => (
            <div key={seed.id} onClick={() => { setSelectedId(seed.id); setView("riffs"); setFilter("all"); }}
              style={{ padding: "10px 14px", cursor: "pointer", background: seed.id === selectedId ? "#000" : "transparent", color: seed.id === selectedId ? "#fff" : "#000", borderBottom: "1px solid #e8e8e8", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{catIcon(seed.category)}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{seed.text}</span>
                </div>
                <div style={{ fontSize: 10.5, color: seed.id === selectedId ? "#aaa" : "#999", marginTop: 2, paddingLeft: 24 }}>
                  {seed.category}{seed.riffs?.length > 0 ? " - " + seed.riffs.length + " found" : ""}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteSeed(seed.id); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: seed.id === selectedId ? "#777" : "#ccc", fontSize: 14, lineHeight: 1, flexShrink: 0, padding: "4px" }}
                aria-label="Remove seed">
                <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" fill="none"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
              </button>
            </div>
          ))}
        </div>

        {/* Actions - RIGHT BELOW seeds, not pinned to bottom */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid #e0e0e0", display: "flex", flexDirection: "column", gap: 5 }}>
          <button onClick={riff} disabled={!selected || loading} style={{ width: "100%", padding: "10px 14px", background: !selected || loading ? "#e8e8e8" : "#000", color: !selected || loading ? "#aaa" : "#fff", border: "none", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "inherit", cursor: !selected || loading ? "default" : "pointer" }}>{loading ? "..." : "RIFF"}</button>
          <button onClick={synthesize} disabled={seeds.length < 2 || synthLoading} style={{ width: "100%", padding: "10px 14px", background: "transparent", color: seeds.length < 2 || synthLoading ? "#ccc" : "#000", border: "1px solid " + (seeds.length < 2 || synthLoading ? "#e0e0e0" : "#000"), fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "inherit", cursor: seeds.length < 2 || synthLoading ? "default" : "pointer" }}>{synthLoading ? "..." : "SYNTHESIZE (" + seeds.length + ")"}</button>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={doExportAll} disabled={seeds.length === 0} style={{ ...tinyBtn, flex: 1 }}>Export All</button>
            <button onClick={() => doCopy(true)} disabled={seeds.length === 0} style={{ ...tinyBtn, flex: 1 }}>{copied ? "Done" : "Copy MD"}</button>
          </div>
          <button onClick={handleReset} style={{ background: "none", border: "none", fontSize: 10, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px", fontFamily: "inherit", cursor: "pointer", textAlign: "center" }}>RESET</button>
        </div>
      </nav>

      {/* Main panel */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tabBar}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <ResultsContent {...resultsProps} />
        </div>
      </main>
    </div>
  );
}

const cssBlock = `
  @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  * { box-sizing: border-box; }
  ::selection { background:#000; color:#fff; }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:#ccc; border-radius:2px; }
  select:focus, input:focus { outline: 1px solid #000; }
`;
