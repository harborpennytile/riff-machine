"use client";

import { useState, useEffect } from "react";
import RiffMachine from "@/components/RiffMachine";

const STORAGE_KEY = "riffmachine:v3";

function hasExistingSeeds() {
  if (typeof window === "undefined") return false;
  try {
    for (const key of [STORAGE_KEY, "riffmachine:v2", "riffmachine:state"]) {
      const val = localStorage.getItem(key);
      if (val) {
        const parsed = JSON.parse(val);
        if (parsed?.seeds?.length) return true;
      }
    }
  } catch {}
  return false;
}

function LandingPage({ onLaunch }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "20px", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      maxWidth: 600, margin: "0 auto",
      wordWrap: "break-word", overflowWrap: "break-word",
    }}>
      <h1 style={{ fontSize: "clamp(28px, 6vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Riff Machine
      </h1>
      <h2 style={{ fontSize: 16, fontWeight: 400, color: "#666", marginBottom: 32 }}>
        A creative discovery engine powered by AI
      </h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: "#444", textAlign: "center", marginBottom: 40 }}>
        Enter seed ideas tagged by category &mdash; art, music, tech, philosophy, finance, food, nature, news &mdash; and discover unexpected connections. Find real articles, songs, artworks, books, and people that connect to your ideas in surprising ways. Then synthesize emergent themes across everything you&apos;ve found. Export to Markdown for Substack, Medium, or your blog.
      </p>

      <div style={{ width: "100%", marginBottom: 48 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#999", marginBottom: 20, textAlign: "center" }}>
          How it works
        </h3>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { step: "1", label: "Seed", desc: "Add ideas tagged by category" },
            { step: "2", label: "Riff", desc: "Discover real resources and connections" },
            { step: "3", label: "Synthesize", desc: "Find emergent themes across seeds" },
          ].map(({ step, label, desc }) => (
            <div key={step} style={{ textAlign: "center", flex: "0 1 160px" }}>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{step}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onLaunch} style={{
        padding: "14px 36px", background: "#000", color: "#fff",
        border: "none", fontSize: 14, fontWeight: 700,
        letterSpacing: "0.06em", textTransform: "uppercase",
        cursor: "pointer", fontFamily: "inherit",
      }}>
        Launch Riff Machine
      </button>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    setMode(hasExistingSeeds() ? "app" : "landing");
  }, []);

  if (mode === null) return null;
  if (mode === "app") return <RiffMachine />;
  return <LandingPage onLaunch={() => setMode("app")} />;
}
