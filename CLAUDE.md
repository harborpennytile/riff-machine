# CLAUDE.md — Riff Machine

## Project Overview
Riff Machine is a creative discovery engine. Users enter seed ideas tagged with categories (art, music, tech, philosophy, finance, food, nature, news, random, other), then "riff" to discover real resources (articles, visuals, music, books, concepts, people) via the Anthropic API. A "synthesize" function finds emergent cross-connections between all seeds. Results export to Markdown for Substack/Medium publishing.

## Architecture
- **Framework:** Next.js 14 (App Router)
- **Deployment:** Vercel (edge runtime for API route)
- **AI:** Anthropic Claude API via `/api/riff` server-side proxy
- **Storage:** localStorage (browser), abstracted via `lib/storage.js`
- **Export:** Markdown generation via `lib/export.js`

## Key Files
```
app/
  layout.js          — Root layout, metadata
  page.js            — Entry point, renders RiffMachine
  globals.css        — Base styles, animations
  api/riff/route.js  — Edge API proxy (keeps ANTHROPIC_API_KEY server-side)
components/
  RiffMachine.js     — Main app component (all UI + state)
lib/
  storage.js         — Storage abstraction (localStorage, swappable)
  export.js          — Markdown export + clipboard utilities
```

## Environment Variables
- `ANTHROPIC_API_KEY` (required, server-side only) — Anthropic API key
- `NEXT_PUBLIC_ANTHROPIC_MODEL` (optional) — Override model, default `claude-sonnet-4-20250514`

## Development Commands
```bash
npm install          # Install dependencies
npm run dev          # Local dev server at localhost:3000
npm run build        # Production build
npm run lint         # ESLint
```

## Design Constraints
- White background, black text, sans-serif (Helvetica Neue)
- Left sidebar: category selector, seed input, seeds list, action buttons, export
- Right panel: tabbed Resources/Synthesis views with type filters
- Streaming responses — resource cards appear progressively
- All state persists in localStorage

## Seed Categories
art, music, tech, philosophy, finance, food, nature, news, random, other

## Resource Types (returned by API)
article, visual, music, book, concept, person

## Key Behaviors
1. **Riff** — Sends seed text + category to API, streams back 4-5 typed resources with URLs, descriptions, and cross-links. Resources accumulate (riff multiple times).
2. **Synthesize** — Reads ALL seeds + resources, finds 2-3 emergent themes connecting 2+ seeds, generates new leads that only exist at intersections.
3. **Export** — Per-seed or full export to `.md` file download. Copy-to-clipboard for pasting into Substack/Medium. Markdown groups resources by type with proper link formatting.

## When Modifying
- Prompts live in `riffPrompt()` and `synthPrompt()` inside `RiffMachine.js`
- Adding new categories: update `SEED_CATEGORIES` and `CAT_ICONS` arrays
- Adding new resource types: update `ICONS` and `TYPE_LABELS` objects
- Storage format changes: update migration logic in the `useEffect` that calls `loadState()`
- API changes: edit `app/api/riff/route.js` — it's a thin proxy

## Testing Notes
- The app uses streaming SSE from Anthropic's API; test with `stream: true`
- Progressive JSON extraction uses regex to find complete objects mid-stream
- Export generates valid Markdown with linked titles, blockquotes for connections
- The synthesis button is enabled with 2+ seeds (regardless of whether they have riffs)
