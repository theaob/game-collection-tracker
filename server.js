import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local .env file if it exists (convenience for development)
const ENV_PATH = path.join(__dirname, '.env');
if (fs.existsSync(ENV_PATH)) {
  const envContent = fs.readFileSync(ENV_PATH, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const splitIdx = trimmed.indexOf('=');
    if (splitIdx === -1) return;
    const key = trimmed.substring(0, splitIdx).trim();
    const val = trimmed.substring(splitIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && val && !process.env[key]) {
      process.env[key] = val;
    }
  });
}

const app = express();
const PORT = process.env.PORT || 3000;
const RAWG_API_KEY = process.env.RAWG_API_KEY || '';

// Database file setup
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'games.json');
const BACKUP_PATH = path.join(DATA_DIR, 'games.json.bak');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial seed data if database does not exist
const SEED_GAMES = [
  {
    id: "seed-1",
    title: "The Legend of Zelda: Breath of the Wild",
    platform: "Nintendo Switch",
    format: "Physical",
    status: "Completed",
    playtime: 120.5,
    rating: 5,
    releaseYear: 2017,
    genre: "Action-Adventure",
    coverUrl: "",
    notes: "An absolute masterpiece. Exploring Hyrule for the first time was magical.",
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "seed-2",
    title: "Elden Ring",
    platform: "PC",
    format: "Digital - Steam",
    status: "Playing",
    playtime: 45.2,
    rating: 5,
    releaseYear: 2022,
    genre: "Action RPG",
    coverUrl: "",
    notes: "Exploring the Lands Between. Challenging but extremely rewarding.",
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "seed-3",
    title: "Spider-Man 2",
    platform: "PlayStation 5",
    format: "Digital - PSN",
    status: "Backlog",
    playtime: 0,
    rating: 0,
    releaseYear: 2023,
    genre: "Action",
    coverUrl: "",
    notes: "Excited to swing around New York again! Need to clear some backlog first.",
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Helper functions for reading and writing data
function loadDatabase() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      // Seed initial data if database doesn't exist
      fs.writeFileSync(DB_PATH, JSON.stringify(SEED_GAMES, null, 2), 'utf-8');
      return SEED_GAMES;
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading database:", error);
    // If corruption occurs, try to restore from backup
    if (fs.existsSync(BACKUP_PATH)) {
      console.warn("Attempting to restore database from backup...");
      try {
        const backupData = fs.readFileSync(BACKUP_PATH, 'utf-8');
        fs.writeFileSync(DB_PATH, backupData, 'utf-8');
        return JSON.parse(backupData);
      } catch (backupError) {
        console.error("Backup restoration failed:", backupError);
      }
    }
    return [];
  }
}

function saveDatabase(data) {
  try {
    // 1. Create a backup of the current database file first (if it exists)
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, BACKUP_PATH);
    }
    // 2. Write new database file
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error("Error saving database:", error);
    return false;
  }
}

// Middleware
app.use(cors());

// Configure Helmet with CSP to allow external fonts, icons, and dynamic images
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net"],
      fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(express.json({ limit: '10mb' })); // Support larger imports
app.use(express.static(path.join(__dirname, 'public')));

// REST API Endpoints

// GET /api/games - Get all games
app.get('/api/games', (req, res) => {
  const games = loadDatabase();
  res.json(games);
});

// POST /api/games - Add a new game
app.post('/api/games', (req, res) => {
  try {
    const { title, platform, format, status, playtime, rating, releaseYear, genre, coverUrl, notes } = req.body;

    if (!title || !platform) {
      return res.status(400).json({ error: "Title and Platform are required fields." });
    }

    const games = loadDatabase();
    
    const newGame = {
      id: 'game-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      title: title.trim(),
      platform: platform.trim(),
      format: format ? format.trim() : "Physical",
      status: status || "Backlog",
      playtime: parseFloat(playtime) || 0,
      rating: parseInt(rating) || 0,
      releaseYear: releaseYear ? parseInt(releaseYear) : null,
      genre: genre ? genre.trim() : "",
      coverUrl: coverUrl ? coverUrl.trim() : "",
      notes: notes ? notes.trim() : "",
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    games.push(newGame);
    if (saveDatabase(games)) {
      res.status(201).json(newGame);
    } else {
      res.status(500).json({ error: "Failed to write to database." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/games/:id - Update game details
app.put('/api/games/:id', (req, res) => {
  try {
    const { id } = req.params;
    const games = loadDatabase();
    const index = games.findIndex(g => g.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Game not found." });
    }

    const { title, platform, format, status, playtime, rating, releaseYear, genre, coverUrl, notes } = req.body;

    // Keep original values if fields not supplied, check required fields
    const updatedGame = {
      ...games[index],
      title: title !== undefined ? title.trim() : games[index].title,
      platform: platform !== undefined ? platform.trim() : games[index].platform,
      format: format !== undefined ? format.trim() : games[index].format,
      status: status !== undefined ? status : games[index].status,
      playtime: playtime !== undefined ? parseFloat(playtime) || 0 : games[index].playtime,
      rating: rating !== undefined ? parseInt(rating) || 0 : games[index].rating,
      releaseYear: releaseYear !== undefined ? (releaseYear ? parseInt(releaseYear) : null) : games[index].releaseYear,
      genre: genre !== undefined ? genre.trim() : games[index].genre,
      coverUrl: coverUrl !== undefined ? coverUrl.trim() : games[index].coverUrl,
      notes: notes !== undefined ? notes.trim() : games[index].notes,
      updatedAt: new Date().toISOString()
    };

    if (!updatedGame.title || !updatedGame.platform) {
      return res.status(400).json({ error: "Title and Platform are required fields." });
    }

    games[index] = updatedGame;
    if (saveDatabase(games)) {
      res.json(updatedGame);
    } else {
      res.status(500).json({ error: "Failed to save updates to database." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/games/:id - Delete a game
app.delete('/api/games/:id', (req, res) => {
  try {
    const { id } = req.params;
    let games = loadDatabase();
    const index = games.findIndex(g => g.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Game not found." });
    }

    const deletedGame = games[index];
    games = games.filter(g => g.id !== id);

    if (saveDatabase(games)) {
      res.json({ message: "Game deleted successfully", game: deletedGame });
    } else {
      res.status(500).json({ error: "Failed to delete game from database." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/stats - Compute and return dashboard stats
app.get('/api/stats', (req, res) => {
  try {
    const games = loadDatabase();
    
    const stats = {
      totalGames: games.length,
      statusCounts: {
        Backlog: 0,
        Playing: 0,
        Completed: 0,
        Abandoned: 0
      },
      formatCounts: {
        Physical: 0,
        Digital: 0
      },
      platformCounts: {},
      totalPlaytime: 0
    };

    games.forEach(game => {
      // 1. Status Counts
      if (stats.statusCounts[game.status] !== undefined) {
        stats.statusCounts[game.status]++;
      } else {
        // Fallback for custom or old statuses
        stats.statusCounts[game.status] = 1;
      }

      // 2. Format Counts (Physical vs Digital)
      const formatLower = (game.format || '').toLowerCase();
      if (formatLower.includes('physical')) {
        stats.formatCounts.Physical++;
      } else if (formatLower.includes('digital') || formatLower.includes('steam') || formatLower.includes('epic') || formatLower.includes('gog') || formatLower.includes('psn') || formatLower.includes('live') || formatLower.includes('eshop')) {
        stats.formatCounts.Digital++;
      } else {
        // Default check
        stats.formatCounts.Digital++;
      }

      // 3. Platform Counts
      const platform = game.platform || 'Unknown';
      stats.platformCounts[platform] = (stats.platformCounts[platform] || 0) + 1;

      // 4. Playtime sum
      stats.totalPlaytime += (parseFloat(game.playtime) || 0);
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/export - Export database JSON
app.get('/api/export', (req, res) => {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return res.status(404).json({ error: "No database file found to export." });
    }
    res.download(DB_PATH, 'game_collection_backup.json');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/import - Import/Overwrite database from JSON payload
app.post('/api/import', (req, res) => {
  try {
    const importData = req.body;

    if (!Array.isArray(importData)) {
      return res.status(400).json({ error: "Import data must be a JSON array of games." });
    }

    // Basic structure validation
    for (let i = 0; i < importData.length; i++) {
      const item = importData[i];
      if (!item.title || !item.platform) {
        return res.status(400).json({ 
          error: `Item at index ${i} is invalid. 'title' and 'platform' are required.` 
        });
      }
    }

    // Ensure all items have IDs
    const normalizedData = importData.map(item => ({
      id: item.id || 'game-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      title: item.title.trim(),
      platform: item.platform.trim(),
      format: item.format ? item.format.trim() : "Physical",
      status: item.status || "Backlog",
      playtime: parseFloat(item.playtime) || 0,
      rating: parseInt(item.rating) || 0,
      releaseYear: item.releaseYear ? parseInt(item.releaseYear) : null,
      genre: item.genre ? item.genre.trim() : "",
      coverUrl: item.coverUrl ? item.coverUrl.trim() : "",
      notes: item.notes ? item.notes.trim() : "",
      addedAt: item.addedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    if (saveDatabase(normalizedData)) {
      res.json({ message: `Successfully imported ${normalizedData.length} games.` });
    } else {
      res.status(500).json({ error: "Failed to write imported data to disk." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/cover-status - Check if cover search is available
app.get('/api/cover-status', (req, res) => {
  res.json({ available: !!RAWG_API_KEY });
});

// GET /api/search-cover - Search for game cover art via RAWG API
app.get('/api/search-cover', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: "Query parameter 'q' is required." });
    }

    if (!RAWG_API_KEY) {
      return res.status(503).json({ 
        error: "Cover search is not configured. Set the RAWG_API_KEY environment variable.",
        hint: "Get a free API key at https://rawg.io/apidocs" 
      });
    }

    const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(query.trim())}&key=${RAWG_API_KEY}&page_size=8`;
    const rawgRes = await fetch(url);

    if (!rawgRes.ok) {
      const errText = await rawgRes.text();
      console.error("RAWG API error:", rawgRes.status, errText);
      return res.status(502).json({ error: "Failed to fetch results from RAWG API." });
    }

    const data = await rawgRes.json();
    const results = (data.results || []).map(game => ({
      name: game.name,
      released: game.released || null,
      coverUrl: game.background_image || '',
      genres: (game.genres || []).map(g => g.name).join(', '),
      platforms: (game.platforms || []).map(p => p.platform.name).join(', '),
      rating: game.rating || 0
    }));

    res.json(results);
  } catch (error) {
    console.error("Cover search error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  loadDatabase(); // Initialize and seed database on startup
  console.log(`==================================================`);
  console.log(`Game Collection Tracker server is running!`);
  console.log(`Access the tracker at: http://localhost:${PORT}`);
  console.log(`Database File: ${DB_PATH}`);
  console.log(`Cover Search: ${RAWG_API_KEY ? 'Enabled (RAWG)' : 'Disabled (set RAWG_API_KEY)'}`);
  console.log(`==================================================`);
});
