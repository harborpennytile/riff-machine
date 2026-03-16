# Riff Machine

A creative discovery engine powered by Claude. Enter seed ideas, discover unexpected connections across articles, music, art, books, and more — then synthesize emergent themes across everything you've found.

## What It Does

**Riff** — Give it a seed idea ("the aesthetics of decay", "sourdough as metaphor") tagged with a category (art, music, tech, philosophy, finance, food, nature, news, random, other). It returns 4-5 real resources — articles with URLs, specific songs, artworks, books, conceptual frameworks, notable people — each explaining *why* it connects and how it relates to the other finds.

**Synthesize** — Once you've riffed on 2+ seeds, hit Synthesize. It reads across all your accumulated discoveries and finds emergent patterns — themes that only become visible when you see the whole picture. Each synthesis names the connection, explains it specifically, and surfaces new leads that no individual seed would have found.

**Export** — Download everything as Markdown (`.md`) or copy to clipboard. Formatted for direct paste into Substack, Medium, or any Markdown editor. Resources grouped by type with proper links.

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/riff-machine&env=ANTHROPIC_API_KEY)

1. Click the button above (or `vercel deploy` from CLI)
2. Set `ANTHROPIC_API_KEY` in environment variables
3. Done

## Local Development

```bash
git clone https://github.com/YOUR_USERNAME/riff-machine.git
cd riff-machine
npm install
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

- **Next.js 14** App Router
- **Edge API route** at `/api/riff` — proxies Anthropic API, keeps key server-side
- **Streaming** — SSE responses, resource cards appear as they generate
- **localStorage** — all seeds, riffs, and syntheses persist in browser
- **Zero dependencies** beyond Next.js and React

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Your Anthropic API key |
| `NEXT_PUBLIC_ANTHROPIC_MODEL` | No | `claude-sonnet-4-20250514` | Model override |

## Export Format

The Markdown export produces clean, publishable content:

```markdown
# 🎨 The aesthetics of decay

**Category:** art

---

## 📄 Article

### [Title of Article](https://url)

Why this connects to the seed idea.

> ↳ *How it relates to other discoveries*

## 🎵 Music

### [Song Title](https://spotify.com/...)
...
```

## Claude Code

This repo includes a `CLAUDE.md` spec for use with [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Claude Code can understand the full architecture, modify prompts, add categories, extend export formats, and deploy changes.

## License

MIT
