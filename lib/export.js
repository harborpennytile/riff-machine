export function exportSeedMarkdown(seed) {
  let md = "# " + seed.text + "\n\n**Category:** " + seed.category + "\n\n---\n\n";
  if (!seed.riffs?.length) return md + "*No resources yet.*\n";
  const byType = {};
  for (const r of seed.riffs) { const t = r.type || "other"; if (!byType[t]) byType[t] = []; byType[t].push(r); }
  for (const [type, items] of Object.entries(byType)) {
    md += "## " + type.charAt(0).toUpperCase() + type.slice(1) + "\n\n";
    for (const item of items) {
      md += item.url ? "### [" + item.title + "](" + item.url + ")\n\n" : "### " + item.title + "\n\n";
      if (item.desc || item.description) md += (item.desc || item.description) + "\n\n";
      if (item.link || item.connection) md += "> " + (item.link || item.connection) + "\n\n";
    }
  }
  return md;
}

export function exportAllMarkdown(seeds, syntheses) {
  const d = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  let md = "# Riff Machine - Discovery Report\n\n*" + d + "*\n\n---\n\n";
  for (const s of seeds.filter(s => s.riffs?.length)) md += exportSeedMarkdown(s) + "\n---\n\n";
  if (syntheses?.length) {
    md += "# Synthesis\n\n";
    for (const syn of syntheses) {
      md += "## " + syn.name + "\n\n" + syn.insight + "\n\n";
      if (syn.seeds?.length) md += "**Seeds:** " + syn.seeds.join(", ") + "\n\n";
      if (syn.leads?.length) { for (const l of syn.leads) { md += l.url ? "- [" + l.title + "](" + l.url + ") - " + (l.desc || "") + "\n" : "- " + l.title + " - " + (l.desc || "") + "\n"; } md += "\n"; }
      md += "---\n\n";
    }
  }
  return md;
}

export function downloadMarkdown(name, content) {
  const b = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
}

export function copyToClipboard(t) { return navigator.clipboard.writeText(t); }
