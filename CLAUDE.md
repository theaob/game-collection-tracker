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

REST API over a file-based JSON database (`data/games.json`). The database is loaded fully into memory on each request via `loadDatabase()`, mutated, then written back to disk. Writes are atomic: `saveDatabase()` copies the current file to `.bak`, writes a `.tmp` file, fsyncs it, then renames it into place.

Key endpoints: `GET/POST /api/games`, `PUT/DELETE /api/games/:id`, `GET /api/stats`, `GET /api/export`, `POST /api/import`, `GET /api/cover-status`, `GET /api/search-cover` (proxies RAWG API).

All writes funnel through `normalizeGame(input, existing, { lenient })`, which is the single source of truth for the game model: it enforces types, length caps, the status enum, and numeric ranges. A `ValidationError` from it becomes a 400 via the central error handler. Values *inherited* from an already-stored record (a PUT that omits fields) and values from `/api/import` are normalized leniently — repaired rather than rejected — so legacy rows stay editable and one odd row cannot fail a whole restore.

Security:
- Helmet.js with custom CSP allowing the CDN sources (Lucide icons, Google Fonts). Note that the CSP forbids inline event handlers (`script-src-attr 'none'`), so **`onclick`/`onerror` attributes in markup will silently not run** — wire events in JS instead.
- CORS is **off** unless `CORS_ORIGIN` is set. The API is unauthenticated, so cross-origin access would let any site read or wipe the collection.
- The error handler returns generic 500s; internals are logged, never sent to the client.

### Frontend (`public/app.js`)

No framework — plain ES6+ with direct DOM manipulation. Global state object holds:
- `games[]` — full collection loaded from API
- `activeFilters` — `{ search, status, platform, format }`
- `sortBy`, `viewMode` (persisted to `localStorage` as `gamevault_sort_by` / `gamevault_view_mode`)
- `activeSession` — playtime timer state (persisted to `localStorage`)
- `floatingObjects[]` — physics engine state for animated background

Rendering flow: filter `games[]` → sort → generate HTML strings → `innerHTML` assign to `.games-grid`. Because rendering goes through `innerHTML`, **every interpolated value must pass through `escapeHTML()`** (and image URLs through `safeImageURL()`) — this includes data echoed back by the API and results from the third-party cover search. Search input is debounced (180 ms) since each render rebuilds every card and recompiles the icon set.

Modals share `openModal`/`closeModal`, which handle focus trapping, focus restore and the `body.modal-open` scroll lock. Destructive actions use the promise-based `askConfirmation()` dialog rather than `window.confirm`.

The background is a physics simulation of 38 floating Lucide icons running in a `requestAnimationFrame` loop with elastic wall/object collisions. It is skipped entirely under `prefers-reduced-motion: reduce`, and re-initialises when that preference changes.

### Game Model

```javascript
{
  id,           // "game-" + timestamp
  title,        // required
  platform,     // required
  format,       // "Physical" | "Digital - Steam" | "Digital - Epic" | etc.
  status,       // "Backlog" | "Playing" | "Completed" | "Abandoned" (enforced)
  playtime,     // hours (float, 0–100000, 1 decimal place)
  rating,       // 0–5 (0 = unrated)
  releaseYear,  // 1950–2100 or null
  genre,
  coverUrl,     // http(s) URL or empty string → procedural gradient fallback
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

See `.env.example`. All variables are optional:
- `PORT` (default `3000`)
- `RAWG_API_KEY` enables cover art search. Without it the feature is gracefully disabled (`/api/cover-status` returns `{ available: false }`).
- `CORS_ORIGIN` opts in to cross-origin API access (comma-separated origins, or `*`). Unset by default.
