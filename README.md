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
- **Secure**: Pre-configured with Helmet CSP security rules, protecting server assets and CORS endpoints.

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

---

## 🐳 How to Run with Docker

GameVault is containerized and ready for easy server deployments. To run it, bind the local database folder as a volume to keep your collection persistent across container restarts or upgrades.

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
├── Dockerfile          # Alpine Node container config
├── .dockerignore       # dockerignore file rules
├── .gitignore          # Git exclusion rules
├── package.json        # Node app package definitions
└── server.js           # Express API endpoints and startup manager
```

---

## 💾 Backups & Database Restoration

- **Manual Backups**: You can download a backup at any time inside the app by clicking the **Settings** (gear) icon in the top right and clicking **Download JSON Backup**.
- **Database Restoration**: To restore your database, open the **Settings** modal, drag and drop your exported JSON backup file, and confirm the overwrite.
- **Portability**: Because the database is stored in a clean JSON format under `data/games.json`, you can simply copy this file to migrate your library to a new server.
