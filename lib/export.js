const TYPE_ICONS = { article: "📄", visual: "🖼", music: "🎵", book: "📖", concept: "💡", person: "👤" };
const CAT_ICONS = { art: "🎨", music: "🎶", tech: "⚡", philosophy: "🧠", finance: "💰", food: "🍳", nature: "🌿", news: "📰", random: "🎲", other: "✦" };

function searchUrl(item) {
  const q = item.search || item.title || "";
  return "https://www.google.com/search?q=" + encodeURIComponent(q);
}

export function exportSeedMarkdown(seed) {
  const icon = CAT_ICONS[seed.category] || "";
  let md = "# " + icon + " " + seed.text + "\n\n";
  md += "**Category:** " + seed.category + "\n\n---\n\n";
  if (!seed.riffs || !seed.riffs.length) return md + "*No resources yet.*\n";

  const byType = {};
  for (const r of seed.riffs) { const t = r.type || "other"; if (!byType[t]) byType[t] = []; byType[t].push(r); }

  for (const [type, items] of Object.entries(byType)) {
    const ti = TYPE_ICONS[type] || "";
    md += "## " + ti + " " + type.charAt(0).toUpperCase() + type.slice(1) + "\n\n";
    for (const item of items) {
      const url = searchUrl(item);
      md += "### [" + item.title + "](" + url + ")\n\n";
      if (item.desc || item.description) md += (item.desc || item.description) + "\n\n";
      if (item.link || item.connection) md += "> >> *" + (item.link || item.connection) + "*\n\n";
    }
  }
  return md;
}

export function exportAllMarkdown(seeds, syntheses) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  let md = "# Riff Machine -- Discovery Report\n\n*Generated " + date + "*\n\n---\n\n";

  for (const s of seeds.filter(s => s.riffs && s.riffs.length)) {
    md += exportSeedMarkdown(s) + "\n---\n\n";
  }

  if (syntheses && syntheses.length) {
    md += "# Synthesis -- Cross-Connections\n\n";
    for (const syn of syntheses) {
      md += "## " + syn.name + "\n\n" + syn.insight + "\n\n";
      if (syn.seeds && syn.seeds.length) md += "**Seeds connected:** " + syn.seeds.join(", ") + "\n\n";
      if (syn.refs && syn.refs.length) md += "**Key references:** " + syn.refs.join(" - ") + "\n\n";
      if (syn.leads && syn.leads.length) {
        md += "### New Leads\n\n";
        for (const l of syn.leads) {
          const url = searchUrl(l);
          md += "- **[" + l.title + "](" + url + ")** -- " + (l.desc || "") + "\n";
        }
        md += "\n";
      }
      md += "---\n\n";
    }
  }

  const unreffed = seeds.filter(s => !s.riffs || !s.riffs.length);
  if (unreffed.length) {
    md += "# Seeds (not yet riffed)\n\n";
    for (const s of unreffed) md += "- " + (CAT_ICONS[s.category] || "") + " **" + s.text + "** *(" + s.category + ")*\n";
  }
  return md;
}

export function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text);
}
