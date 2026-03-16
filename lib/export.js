const ICONS = { article: "📄", visual: "🖼", music: "🎵", book: "📖", concept: "💡", person: "👤" };
const CAT_ICONS = { art: "🎨", music: "🎶", tech: "⚡", philosophy: "🧠", finance: "💰", food: "🍳", nature: "🌿", news: "📰", random: "🎲", other: "✦" };

export function exportSeedMarkdown(seed) {
  const icon = CAT_ICONS[seed.category] || "●";
  let md = `# ${icon} ${seed.text}\n\n`;
  md += `**Category:** ${seed.category}\n\n`;

  if (!seed.riffs?.length) {
    md += `*No resources discovered yet.*\n`;
    return md;
  }

  md += `---\n\n`;

  // Group by type
  const byType = {};
  for (const r of seed.riffs) {
    const t = r.type || "other";
    if (!byType[t]) byType[t] = [];
    byType[t].push(r);
  }

  for (const [type, items] of Object.entries(byType)) {
    const typeIcon = ICONS[type] || "📌";
    md += `## ${typeIcon} ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n`;
    for (const item of items) {
      if (item.url) {
        md += `### [${item.title}](${item.url})\n\n`;
      } else {
        md += `### ${item.title}\n\n`;
      }
      if (item.desc || item.description) {
        md += `${item.desc || item.description}\n\n`;
      }
      if (item.link || item.connection) {
        md += `> ↳ *${item.link || item.connection}*\n\n`;
      }
    }
  }

  return md;
}

export function exportAllMarkdown(seeds, syntheses) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  let md = `# Riff Machine — Discovery Report\n\n`;
  md += `*Generated ${date}*\n\n`;
  md += `---\n\n`;

  // Seeds with riffs
  const withRiffs = seeds.filter(s => s.riffs?.length > 0);
  const withoutRiffs = seeds.filter(s => !s.riffs?.length);

  for (const seed of withRiffs) {
    md += exportSeedMarkdown(seed);
    md += `\n---\n\n`;
  }

  // Synthesis section
  if (syntheses?.length > 0) {
    md += `# 🔗 Synthesis — Cross-Connections\n\n`;
    for (const syn of syntheses) {
      md += `## ${syn.name}\n\n`;
      md += `${syn.insight}\n\n`;
      if (syn.seeds?.length) {
        md += `**Seeds connected:** ${syn.seeds.join(", ")}\n\n`;
      }
      if (syn.refs?.length) {
        md += `**Key references:** ${syn.refs.join(" · ")}\n\n`;
      }
      if (syn.leads?.length) {
        md += `### New Leads\n\n`;
        for (const lead of syn.leads) {
          if (lead.url) {
            md += `- **[${lead.title}](${lead.url})** — ${lead.desc || lead.description || ""}\n`;
          } else {
            md += `- **${lead.title}** — ${lead.desc || lead.description || ""}\n`;
          }
        }
        md += `\n`;
      }
      md += `---\n\n`;
    }
  }

  // Unreffed seeds
  if (withoutRiffs.length > 0) {
    md += `# Seeds (not yet riffed)\n\n`;
    for (const seed of withoutRiffs) {
      const icon = CAT_ICONS[seed.category] || "●";
      md += `- ${icon} **${seed.text}** *(${seed.category})*\n`;
    }
    md += `\n`;
  }

  return md;
}

export function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text);
}
