# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start with --watch (auto-restart on file changes)
npm start            # Start server (production)
```

Access at `http://localhost:3000`. No build step required — frontend is static.

**Docker:**
```bash
docker build -t gamevault .
docker run -d -p 3000:3000 -v /my/data:/app/data --name gamevault gamevault
```

There is no test framework configured.

## Architecture

Full-stack Node.js app using ES modules (`"type": "module"`). Three source files do essentially everything:

- **`server.js`** — Express backend with all REST endpoints and JSON database logic
- **`public/app.js`** — Vanilla JS frontend (~1500 lines): state management, DOM rendering, API calls
- **`public/index.html`** — Static HTML shell with modal scaffolding
- **`public/styles.css`** — Design system using CSS custom properties (glassmorphism dark theme)

### Backend (`server.js`)

REST API over a file-based JSON database (`data/games.json`). The database is loaded fully into memory on each request via `loadDatabase()`, mutated, then written back to disk. A `.bak` file is created before every write for auto-recovery.

Key endpoints: `GET/POST /api/games`, `PUT/DELETE /api/games/:id`, `GET /api/stats`, `GET /api/export`, `POST /api/import`, `GET /api/search-cover` (proxies RAWG API).

Security: Helmet.js with custom CSP that allows the CDN sources (Lucide icons, Google Fonts).

### Frontend (`public/app.js`)

No framework — plain ES6+ with direct DOM manipulation. Global state object holds:
- `games[]` — full collection loaded from API
- `activeFilters` — `{ search, status, platform, format }`
- `sortBy`, `viewMode` (persisted to `localStorage`)
- `activeSession` — playtime timer state (persisted to `localStorage`)
- `floatingObjects[]` — physics engine state for animated background

Rendering flow: filter `games[]` → sort → generate HTML strings → `innerHTML` assign to `.games-grid`.

The background is a physics simulation of 38 floating Lucide icons running in a `requestAnimationFrame` loop with elastic wall/object collisions.

### Game Model

```javascript
{
  id,           // "game-" + timestamp
  title,        // required
  platform,     // required
  format,       // "Physical" | "Digital - Steam" | "Digital - Epic" | etc.
  status,       // "Backlog" | "Playing" | "Completed" | "Abandoned"
  playtime,     // hours (float)
  rating,       // 1–5
  releaseYear,
  genre,
  coverUrl,     // URL or empty string → procedural gradient fallback
  notes,
  addedAt,      // ISO8601
  updatedAt     // ISO8601
}
```

### Design System

Documented in `STYLE.md`. Key conventions:
- CSS variables for all colors: `--bg-primary`, `--accent` (`#6366f1` indigo), status colors (amber/emerald/sky/rose)
- Glassmorphism: `background: rgba(255,255,255,0.03)`, `backdrop-filter: blur(...)`, `border: 1px solid rgba(255,255,255,0.07)`
- Font: Outfit (Google Fonts, 300–800 weights via CDN)
- Icons: Lucide via CDN

### Environment

`RAWG_API_KEY` in `.env` enables cover art search. Without it, the feature is gracefully disabled (`/api/cover-status` returns `{ available: false }`).
