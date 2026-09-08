# GameVault 🎮

GameVault is a self-hosted, lightweight, and premium **Game Collection Tracker** designed to catalog and track your games across multiple platforms, physical copies, and digital storefronts. 

It is built as a lightweight full-stack Node.js application that serves a responsive, glassmorphic single-page web interface.

---

## ✨ Features

- **Multi-Platform Support**: Presets for PC, PlayStation 5/4, Xbox Series X|S, Xbox One, Nintendo Switch, and Retro platforms.
- **Physical vs. Digital Tracking**: Map copies to physical formats or digital libraries like **Steam**, **Epic Games Store**, **GOG**, **PlayStation Network (PSN)**, **Xbox Store**, and **Nintendo eShop**.
- **Dashboard Analysis**: Interactive status counters (Backlog, Now Playing, Completed, Abandoned) and automatic analysis metrics (completion rate, platform distribution chart, and format breakdown).
- **⏱️ Live Playtime Session Tracker**: A built-in timer on game cards. Click play to start tracking, pause to stop. The active tracking session is saved in `localStorage` so it survives page reloads/refreshes.
- **Procedural fallback covers**: If a game doesn't have a cover image URL, GameVault automatically generates a stylized, colorful gradient cover container with the game's initials.
- **Backup & Restore**: Export your collection database as a JSON backup file and restore it by dragging & dropping files directly in the Settings panel.
- **Accessible**: Full keyboard operation, visible focus rings, dialog focus trapping, screen-reader labels, and support for `prefers-reduced-motion`.
- **Secure**: Helmet CSP rules, server-side validation of every field, escaped rendering throughout, and cross-origin access disabled by default.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express, Helmet, CORS
- **Database**: Local File-based JSON Database (`data/games.json`) with automatic backups on startup/save
- **Frontend**: Semantic HTML5, Vanilla CSS, Vanilla JavaScript, Lucide Icons (CDN), Google Fonts (Outfit)

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js (v20 or higher recommended)
- npm (v10 or higher)

### Installation Steps
1. Clone or download this repository.
2. Navigate to the project root directory and install dependencies:
   ```bash
   npm install
   ```
3. Start the application:
   - **For Development** (automatically restarts the server on file edits):
     ```bash
     npm run dev
     ```
   - **For Production**:
     ```bash
     npm start
     ```
4. Access the web dashboard at: `http://localhost:3000`

### Configuration

All settings are optional environment variables; copy `.env.example` to `.env` to set them locally.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on. |
| `RAWG_API_KEY` | _(unset)_ | Enables the **Search Online** cover art and metadata lookup. Without it, the button reports that the feature is not configured. Free key at [rawg.io/apidocs](https://rawg.io/apidocs). |
| `CORS_ORIGIN` | _(unset)_ | Comma-separated list of allowed origins, or `*`. **Leave unset unless you need it** — the API has no authentication, so enabling CORS lets any listed origin read and overwrite your collection. |

---

## 🐳 How to Run with Docker

GameVault is containerized and ready for easy server deployments. To run it, bind the local database folder as a volume to keep your collection persistent across container restarts or upgrades.

**Option A — pull the published image:**
```bash
docker run -d \
  -p 3000:3000 \
  -v /my/server/gamevault-data:/app/data \
  --name gamevault \
  --restart unless-stopped \
  theaob/game-collection-tracker:latest
```
Published automatically to [Docker Hub](https://hub.docker.com/r/theaob/game-collection-tracker) whenever `version` in `package.json` is bumped on `main` (see `.github/workflows/docker-publish.yml`); `latest` always tracks the newest release, or pin a version tag such as `:1.2.0`.

**Option B — build it yourself:**

1. **Build the Docker Image**:
   ```bash
   docker build -t gamevault .
   ```

2. **Run the Container**:
   Replace `/my/server/gamevault-data` with the actual folder path on your host machine where you want to keep the database:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -v /my/server/gamevault-data:/app/data \
     --name gamevault \
     --restart unless-stopped \
     gamevault
   ```

---

## 📂 Project Structure

```
game-collection-tracker/
├── data/               # Persistent database storage
│   ├── games.json      # Your collection database (auto-created)
│   └── games.json.bak  # Automated database backup file
├── public/             # Web frontend static assets
│   ├── index.html      # Main HTML structure and modals
│   ├── styles.css      # Custom design system and glassmorphism layout
│   └── app.js          # REST API bindings, state manager, timer logic
├── .env.example        # Documented environment variables
├── Dockerfile          # Alpine Node container config (runs as non-root)
├── .github/workflows/  # CI: publishes the Docker image on a version bump
├── .dockerignore       # dockerignore file rules
├── .gitignore          # Git exclusion rules
├── package.json        # Node app package definitions
└── server.js           # Express API endpoints and startup manager
```

---

## 🚢 Releasing (maintainers)

Bumping `version` in `package.json` and merging that to `main` is the release trigger: `.github/workflows/docker-publish.yml` builds a multi-arch (`amd64`/`arm64`) image and pushes `theaob/game-collection-tracker:<version>` and `:latest` to Docker Hub. A push to `main` that doesn't touch `package.json`, or touches it without changing `version`, does not publish.

One-time setup: add two repository secrets under **Settings → Secrets and variables → Actions**:
- `DOCKERHUB_USERNAME` — your Docker Hub username.
- `DOCKERHUB_TOKEN` — a Docker Hub [access token](https://hub.docker.com/settings/security) (not your account password).

To republish without a version bump (e.g. after fixing the secrets), run the workflow manually from the **Actions** tab (`workflow_dispatch`).

---

## 💾 Backups & Database Restoration

- **Manual Backups**: You can download a backup at any time inside the app by clicking the **Settings** (gear) icon in the top right and clicking **Download JSON Backup**.
- **Database Restoration**: To restore your database, open the **Settings** modal, drag and drop your exported JSON backup file, and confirm the overwrite.
- **Portability**: Because the database is stored in a clean JSON format under `data/games.json`, you can simply copy this file to migrate your library to a new server.
- **Crash safety**: Writes go to a temporary file that is flushed to disk and then renamed into place, so an interrupted write cannot leave a half-written `games.json`. The previous version is kept in `games.json.bak` and is restored automatically if the main file is ever unreadable.

---

## 🔮 Future Work & Roadmap

Planned features and improvement areas for upcoming releases:

### Near-Term
- **Wishlist Status**: Add a "Wishlist" status alongside Backlog/Playing/Completed/Abandoned to track games you plan to purchase.
- **Tags & Custom Labels**: Allow user-defined tags (e.g., "couch co-op", "100% complete", "speedrun") for richer filtering.
- **Genre Auto-Complete**: Pre-populated genre suggestions when adding/editing games.

### Mid-Term
- **Multi-User Support**: Optional authentication layer with per-user libraries for shared household servers.
- **SQLite Backend**: Optional migration path from JSON to SQLite for users with very large collections (10,000+ games).
- **Steam/GOG API Import**: One-click bulk import from Steam, GOG Galaxy, or PlayStation trophy lists.
- **Mobile-First PWA**: Service worker support for offline access and "Add to Home Screen" on mobile devices.

### Long-Term
- **Achievement Tracking**: Log and display achievements/trophies per game.
- **Friends & Social**: Share your collection or completion stats with friends via public profile links.
- **Play History Timeline**: Visual timeline of your gaming sessions, showing what you played and when.
- **Plugin System**: Extensible architecture for community-built integrations (e.g., HowLongToBeat estimates, price trackers).
