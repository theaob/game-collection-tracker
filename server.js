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

// Cross-origin requests are disabled by default: the API is unauthenticated, so
// any site the user visits could otherwise read or wipe their collection.
// Set CORS_ORIGIN (comma-separated list, or "*") to opt in explicitly.
const CORS_ORIGIN = (process.env.CORS_ORIGIN || '').trim();

// Database file setup
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'games.json');
const BACKUP_PATH = path.join(DATA_DIR, 'games.json.bak');
const TEMP_PATH = path.join(DATA_DIR, 'games.json.tmp');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Game model constraints
const STATUSES = ['Backlog', 'Playing', 'Completed', 'Abandoned'];
const MAX_TITLE_LENGTH = 200;
const MAX_PLATFORM_LENGTH = 60;
const MAX_FORMAT_LENGTH = 60;
const MAX_GENRE_LENGTH = 100;
const MAX_URL_LENGTH = 2000;
const MAX_NOTES_LENGTH = 5000;
const MAX_PLAYTIME = 100000; // hours
const MIN_RELEASE_YEAR = 1950;
const MAX_RELEASE_YEAR = 2100;
const MAX_IMPORT_ITEMS = 20000;

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
      saveDatabase(SEED_GAMES);
      return SEED_GAMES;
    }
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (!Array.isArray(parsed)) {
      throw new Error("Database file does not contain a JSON array.");
    }
    return parsed;
  } catch (error) {
    console.error("Error reading database:", error);
    // If corruption occurs, try to restore from backup
    if (fs.existsSync(BACKUP_PATH)) {
      console.warn("Attempting to restore database from backup...");
      try {
        const backupData = fs.readFileSync(BACKUP_PATH, 'utf-8');
        const parsedBackup = JSON.parse(backupData);
        if (!Array.isArray(parsedBackup)) {
          throw new Error("Backup file does not contain a JSON array.");
        }
        fs.writeFileSync(DB_PATH, backupData, 'utf-8');
        return parsedBackup;
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
    // 2. Write to a temp file and rename it into place, so an interrupted write
    //    can never leave a half-written games.json behind.
    const payload = JSON.stringify(data, null, 2);
    const fd = fs.openSync(TEMP_PATH, 'w');
    try {
      fs.writeFileSync(fd, payload, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(TEMP_PATH, DB_PATH);
    return true;
  } catch (error) {
    console.error("Error saving database:", error);
    try {
      if (fs.existsSync(TEMP_PATH)) fs.unlinkSync(TEMP_PATH);
    } catch { /* best effort cleanup */ }
    return false;
  }
}

function generateId() {
  return 'game-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
}

// Validation helpers ------------------------------------------------------

class ValidationError extends Error {}

// Accepts strings (and numbers, which arrive from loosely-typed imports),
// rejects objects/arrays/booleans that would blow up downstream string calls.
// `lenient` is used for values inherited from an already-stored record: those
// are repaired rather than rejected, so a legacy row stays editable.
function readString(value, fieldName, maxLength, lenient = false) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string') {
    if (lenient) return '';
    throw new ValidationError(`'${fieldName}' must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    if (lenient) return trimmed.substring(0, maxLength);
    throw new ValidationError(`'${fieldName}' must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

// Cover art is rendered in an <img>; only absolute http(s) URLs are useful here.
function readCoverUrl(value, lenient = false) {
  const raw = readString(value, 'coverUrl', MAX_URL_LENGTH, lenient);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (lenient) return '';
  throw new ValidationError("'coverUrl' must be an http(s) URL.");
}

function readNumber(value, fallback) {
  const num = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function readPlaytime(value) {
  return Math.round(clamp(readNumber(value, 0), 0, MAX_PLAYTIME) * 10) / 10;
}

function readRating(value) {
  return clamp(Math.round(readNumber(value, 0)), 0, 5);
}

function readReleaseYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const year = Math.round(readNumber(value, NaN));
  if (!Number.isFinite(year)) return null;
  return clamp(year, MIN_RELEASE_YEAR, MAX_RELEASE_YEAR);
}

function readStatus(value, lenient = false) {
  if (value === null || value === undefined || value === '') return 'Backlog';
  if (typeof value !== 'string' || !STATUSES.includes(value)) {
    if (lenient) return 'Backlog';
    throw new ValidationError(`'status' must be one of: ${STATUSES.join(', ')}.`);
  }
  return value;
}

// Builds a fully normalized game record. `existing` supplies the previous value
// for any field the caller omitted (used by PUT for partial updates); those
// inherited values are repaired instead of rejected so that a record written by
// an older version of the app can still be saved.
// `lenient: true` applies the same repair-don't-reject policy to caller-supplied
// values; imports use it so one odd legacy row cannot fail a whole restore.
function normalizeGame(input, existing = null, { lenient = false } = {}) {
  // Returns [value, isInherited] so each reader knows how strict to be.
  const pick = (field) => (input[field] !== undefined
    ? [input[field], lenient]
    : [existing ? existing[field] : undefined, true]);

  const read = (field, reader) => {
    const [value, inherited] = pick(field);
    return reader(value, inherited);
  };

  const title = read('title', (v, lenient) => readString(v, 'title', MAX_TITLE_LENGTH, lenient));
  const platform = read('platform', (v, lenient) => readString(v, 'platform', MAX_PLATFORM_LENGTH, lenient));

  if (!title || !platform) {
    throw new ValidationError("Title and Platform are required fields.");
  }

  return {
    id: existing?.id || (typeof input.id === 'string' && input.id.trim() ? input.id.trim() : generateId()),
    title,
    platform,
    format: read('format', (v, l) => readString(v, 'format', MAX_FORMAT_LENGTH, l)) || 'Physical',
    status: read('status', readStatus),
    playtime: read('playtime', readPlaytime),
    rating: read('rating', readRating),
    releaseYear: read('releaseYear', readReleaseYear),
    genre: read('genre', (v, l) => readString(v, 'genre', MAX_GENRE_LENGTH, l)),
    coverUrl: read('coverUrl', readCoverUrl),
    notes: read('notes', (v, l) => readString(v, 'notes', MAX_NOTES_LENGTH, l)),
    addedAt: existing?.addedAt || (typeof input.addedAt === 'string' ? input.addedAt : new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };
}

// Middleware
if (CORS_ORIGIN) {
  app.use(cors({ origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(o => o.trim()) }));
}

// Configure Helmet with CSP to allow external fonts, icons, and dynamic images
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net"],
      fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
      // Cover art is fetched from arbitrary third-party hosts; keep it to HTTPS
      // so a cover URL cannot downgrade the page to mixed content.
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));

app.use(express.json({ limit: '10mb' })); // Support larger imports
app.use(express.static(path.join(__dirname, 'public')));

// REST API Endpoints

// GET /api/games - Get all games
app.get('/api/games', (req, res, next) => {
  try {
    res.json(loadDatabase());
  } catch (error) {
    next(error);
  }
});

// POST /api/games - Add a new game
app.post('/api/games', (req, res, next) => {
  try {
    const newGame = normalizeGame(req.body || {});
    const games = loadDatabase();
    games.push(newGame);

    if (saveDatabase(games)) {
      res.status(201).json(newGame);
    } else {
      res.status(500).json({ error: "Failed to write to database." });
    }
  } catch (error) {
    next(error);
  }
});

// PUT /api/games/:id - Update game details
app.put('/api/games/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const games = loadDatabase();
    const index = games.findIndex(g => g.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Game not found." });
    }

    // Fields left out of the payload keep their previous values
    const updatedGame = normalizeGame(req.body || {}, games[index]);
    games[index] = updatedGame;

    if (saveDatabase(games)) {
      res.json(updatedGame);
    } else {
      res.status(500).json({ error: "Failed to save updates to database." });
    }
  } catch (error) {
    next(error);
  }
});

// DELETE /api/games/:id - Delete a game
app.delete('/api/games/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const games = loadDatabase();
    const index = games.findIndex(g => g.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Game not found." });
    }

    const [deletedGame] = games.splice(index, 1);

    if (saveDatabase(games)) {
      res.json({ message: "Game deleted successfully", game: deletedGame });
    } else {
      res.status(500).json({ error: "Failed to delete game from database." });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/stats - Compute and return dashboard stats
app.get('/api/stats', (req, res, next) => {
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
      totalPlaytime: 0,
      ratedGames: 0,
      averageRating: 0
    };

    let ratingSum = 0;

    games.forEach(game => {
      // 1. Status Counts
      if (stats.statusCounts[game.status] !== undefined) {
        stats.statusCounts[game.status]++;
      } else {
        // Fallback for custom or old statuses
        stats.statusCounts[game.status] = 1;
      }

      // 2. Format Counts (Physical vs Digital; anything unrecognised counts as digital)
      const formatLower = (game.format || '').toLowerCase();
      if (formatLower.includes('physical')) {
        stats.formatCounts.Physical++;
      } else {
        stats.formatCounts.Digital++;
      }

      // 3. Platform Counts
      const platform = game.platform || 'Unknown';
      stats.platformCounts[platform] = (stats.platformCounts[platform] || 0) + 1;

      // 4. Playtime sum
      stats.totalPlaytime += (parseFloat(game.playtime) || 0);

      // 5. Rating average (only over games that were actually rated)
      const rating = parseFloat(game.rating) || 0;
      if (rating > 0) {
        stats.ratedGames++;
        ratingSum += rating;
      }
    });

    stats.totalPlaytime = Math.round(stats.totalPlaytime * 10) / 10;
    stats.averageRating = stats.ratedGames > 0
      ? Math.round((ratingSum / stats.ratedGames) * 10) / 10
      : 0;

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/export - Export database JSON
app.get('/api/export', (req, res, next) => {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return res.status(404).json({ error: "No database file found to export." });
    }
    res.download(DB_PATH, 'game_collection_backup.json');
  } catch (error) {
    next(error);
  }
});

// POST /api/import - Import/Overwrite database from JSON payload
app.post('/api/import', (req, res, next) => {
  try {
    const importData = req.body;

    if (!Array.isArray(importData)) {
      return res.status(400).json({ error: "Import data must be a JSON array of games." });
    }

    if (importData.length > MAX_IMPORT_ITEMS) {
      return res.status(400).json({ error: `Import is limited to ${MAX_IMPORT_ITEMS} games.` });
    }

    const seenIds = new Set();
    const normalizedData = [];

    for (let i = 0; i < importData.length; i++) {
      const item = importData[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({ error: `Item at index ${i} is not a game object.` });
      }

      let normalized;
      try {
        normalized = normalizeGame(item, null, { lenient: true });
      } catch (error) {
        if (error instanceof ValidationError) {
          return res.status(400).json({ error: `Item at index ${i} is invalid. ${error.message}` });
        }
        throw error;
      }

      // Imported files can carry duplicate ids; re-key the collisions so every
      // record stays individually addressable.
      if (seenIds.has(normalized.id)) {
        normalized.id = generateId();
      }
      seenIds.add(normalized.id);
      normalizedData.push(normalized);
    }

    if (saveDatabase(normalizedData)) {
      res.json({ message: `Successfully imported ${normalizedData.length} games.` });
    } else {
      res.status(500).json({ error: "Failed to write imported data to disk." });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/cover-status - Check if cover search is available
app.get('/api/cover-status', (req, res) => {
  res.json({ available: !!RAWG_API_KEY });
});

// GET /api/search-cover - Search for game cover art via RAWG API
app.get('/api/search-cover', async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required." });
    }

    if (!RAWG_API_KEY) {
      return res.status(503).json({
        error: "Cover search is not configured. Set the RAWG_API_KEY environment variable.",
        hint: "Get a free API key at https://rawg.io/apidocs"
      });
    }

    const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&key=${encodeURIComponent(RAWG_API_KEY)}&page_size=8`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    let rawgRes;
    try {
      rawgRes = await fetch(url, { signal: controller.signal });
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        console.error("RAWG API search timed out for query:", query);
        return res.status(504).json({ error: "Search request to RAWG API timed out (6s)." });
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!rawgRes.ok) {
      const errText = await rawgRes.text();
      console.error("RAWG API error:", rawgRes.status, errText);
      return res.status(502).json({ error: "Failed to fetch results from RAWG API." });
    }

    const data = await rawgRes.json();
    const results = (data.results || []).map(game => ({
      name: game.name,
      released: game.released || null,
      // Only surface https covers: the page's CSP blocks anything else anyway.
      coverUrl: typeof game.background_image === 'string' && game.background_image.startsWith('https://')
        ? game.background_image
        : '',
      genres: (game.genres || []).map(g => g.name).join(', '),
      platforms: (game.platforms || []).map(p => p.platform.name).join(', '),
      rating: game.rating || 0
    }));

    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Unknown API routes should answer with JSON, not the static index.html
app.use('/api', (req, res) => {
  res.status(404).json({ error: "Unknown API endpoint." });
});

// Central error handler: report validation problems, keep internals private
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: "Request body is not valid JSON." });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: "Request body is too large." });
  }
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// Start the server
app.listen(PORT, () => {
  loadDatabase(); // Initialize and seed database on startup
  console.log(`==================================================`);
  console.log(`Game Collection Tracker server is running!`);
  console.log(`Access the tracker at: http://localhost:${PORT}`);
  console.log(`Database File: ${DB_PATH}`);
  console.log(`Cover Search: ${RAWG_API_KEY ? 'Enabled (RAWG)' : 'Disabled (set RAWG_API_KEY)'}`);
  console.log(`CORS: ${CORS_ORIGIN ? `Enabled (${CORS_ORIGIN})` : 'Disabled (same-origin only)'}`);
  console.log(`==================================================`);
});
