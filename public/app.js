// GameVault Frontend Engine

// App State
let games = [];
let activeFilters = {
  search: '',
  status: 'All',
  platform: 'All',
  format: 'All'
};
let sortBy = 'added-desc';
let viewMode = 'grid'; // 'grid' or 'list'
let hasLoadedGames = false; // guards the skeleton placeholders
let loadFailed = false;     // distinguishes "empty library" from "could not load"

// Session Timer State
let activeSession = null; // { gameId, startTime, accumulatedMs }
let sessionTimerInterval = null;

// HTML Escaping Utility for XSS Prevention.
// Every value that reaches an innerHTML sink must pass through this, including
// data echoed back by the API and results from the third-party cover search.
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Only absolute http(s) URLs are allowed into image src attributes
function safeImageURL(url) {
  if (typeof url !== 'string') return '';
  return /^https?:\/\//i.test(url.trim()) ? escapeHTML(url.trim()) : '';
}

function debounce(fn, wait) {
  let timeoutId = null;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

// Procedural cover colours derived from the title, so a game without cover art
// still gets a stable, distinctive gradient.
function coverGradient(title) {
  let hash = 0;
  const text = title || '';
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 60) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${h1}, 45%, 15%) 0%, hsl(${h2}, 45%, 8%) 100%)`,
    accent: `hsl(${h1}, 70%, 65%)`
  };
}

// Details Modal Elements
const detailsModal = document.getElementById('details-modal');
const detailsCoverContainer = document.getElementById('details-cover-container');
const detailsTitle = document.getElementById('details-title');
const detailsStatus = document.getElementById('details-status');
const detailsPlatform = document.getElementById('details-platform');
const detailsFormat = document.getElementById('details-format');
const detailsPlaytime = document.getElementById('details-playtime');
const detailsRelease = document.getElementById('details-release');
const detailsGenre = document.getElementById('details-genre');
const detailsRating = document.getElementById('details-rating');
const detailsNotes = document.getElementById('details-notes');
const detailsDeleteBtn = document.getElementById('details-delete-btn');
const detailsEditBtn = document.getElementById('details-edit-btn');

// DOM Elements
const gamesGrid = document.getElementById('games-grid');
const emptyState = document.getElementById('empty-state');
const emptyStateAddBtn = document.getElementById('empty-state-add-btn');
const libraryCountBadge = document.getElementById('library-count-badge');
const libraryCurrentView = document.getElementById('library-current-view');

// Filters and Sorts
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear-btn');
const filterPlatform = document.getElementById('filter-platform');
const filterFormat = document.getElementById('filter-format');
const sortBySelect = document.getElementById('sort-by');
const viewGridBtn = document.getElementById('view-grid-btn');
const viewListBtn = document.getElementById('view-list-btn');
const activeFiltersContainer = document.getElementById('active-filters-container');
const filterTagsList = document.getElementById('filter-tags-list');
const clearAllFiltersBtn = document.getElementById('clear-all-filters');

// Modals
const gameModal = document.getElementById('game-modal');
const gameForm = document.getElementById('game-form');
const modalTitle = document.getElementById('modal-title');
const gameIdInput = document.getElementById('game-id-input');
const customPlatformInput = document.getElementById('custom-platform-input');
const gamePlatformSelect = document.getElementById('game-platform');
const gameFormatSelect = document.getElementById('game-format');
const gameRatingInput = document.getElementById('game-rating');
const starsContainer = document.getElementById('rating-stars-container');

// Settings Modal
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const settingsCloseX = document.getElementById('settings-close-x');

const importDropzone = document.getElementById('import-dropzone');
const importFileInput = document.getElementById('import-file-input');
const importFilenameDisplay = document.getElementById('import-filename');
const importFilenameText = document.getElementById('import-filename-text');
const removeImportFileBtn = document.getElementById('remove-import-file-btn');
const importSubmitBtn = document.getElementById('import-submit-btn');

// Navigation triggers
const navAll = document.getElementById('nav-all');
const navStatsTrigger = document.getElementById('nav-stats-trigger');
const backToLibraryBtn = document.getElementById('back-to-library-btn');
const statsDashboard = document.getElementById('stats-dashboard');
const librarySection = document.getElementById('library-section');
const analysisSection = document.getElementById('analysis-section');

// Stats Displays
const miniTotalGames = document.getElementById('mini-total-games');
const miniTotalPlaytime = document.getElementById('mini-total-playtime');
const countBacklog = document.getElementById('count-backlog');
const countPlaying = document.getElementById('count-playing');
const countCompleted = document.getElementById('count-completed');
const countAbandoned = document.getElementById('count-abandoned');

// Page Lifecycle Initialization
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Restore persisted UI preferences before the first render
  const savedViewMode = localStorage.getItem('gamevault_view_mode');
  if (savedViewMode === 'grid' || savedViewMode === 'list') {
    viewMode = savedViewMode;
  }
  updateViewModeButtons();

  const savedSortBy = localStorage.getItem('gamevault_sort_by');
  if (savedSortBy && Array.from(sortBySelect.options).some(o => o.value === savedSortBy)) {
    sortBy = savedSortBy;
    sortBySelect.value = savedSortBy;
  }

  // Fetch initial games database
  fetchGames();

  // Setup Event Listeners
  setupEventListeners();
  
  // Restore live session timer if saved in localStorage
  initSessionTimer();
  
  // Initialize background floating elements, and react to a motion-preference change
  initFloatingBackground();
  reducedMotionQuery.addEventListener('change', initFloatingBackground);

  // Initial Lucide Icons compilation
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Physics state for floating objects
let floatingObjects = [];
let animFrameId = null;

// Spawns randomized floating game-themed icons in the background with elastic collisions
function initFloatingBackground() {
  const container = document.getElementById('floating-bg');
  if (!container) return;

  // Clear existing items & cancel any active loop
  container.innerHTML = '';
  floatingObjects = [];
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // A screenful of drifting, colliding icons is exactly the kind of motion
  // "reduce motion" asks us to drop.
  if (reducedMotionQuery.matches) return;

  const icons = [
    'gamepad-2', 'swords', 'trophy', 'shield', 'star',
    'crown', 'zap', 'key', 'disc', 'joystick', 'target', 'dribbble'
  ];

  // Increase object count as requested
  const objectCount = 38;
  
  // Fallback to defaults if layout dimensions are not ready (0px viewport)
  let width = window.innerWidth || 1200;
  let height = window.innerHeight || 800;
  if (width < 300) width = 1200;
  if (height < 300) height = 800;

  for (let i = 0; i < objectCount; i++) {
    const el = document.createElement('div');
    el.className = 'floating-object';
    
    const iconName = icons[Math.floor(Math.random() * icons.length)];
    el.setAttribute('data-lucide', iconName);

    const size = Math.floor(Math.random() * 25) + 25; // 25px to 50px
    const radius = size / 2;

    // Distribute randomly ensuring minimal overlap at spawn
    let x, y, overlap;
    let attempts = 0;
    do {
      x = Math.random() * (width - size);
      y = Math.random() * (height - size);
      overlap = false;
      for (const obj of floatingObjects) {
        const dx = obj.x - (x + radius);
        const dy = obj.y - (y + radius);
        const dist = Math.hypot(dx, dy);
        if (dist < (obj.radius + radius + 15)) {
          overlap = true;
          break;
        }
      }
      attempts++;
    } while (overlap && attempts < 100);

    // Initial space drift speeds (slightly faster and more visible)
    const speed = Math.random() * 0.7 + 0.4; // 0.4 to 1.1 pixels per frame
    const angleDir = Math.random() * Math.PI * 2;
    const vx = Math.cos(angleDir) * speed;
    const vy = Math.sin(angleDir) * speed;

    const angle = Math.random() * 360;
    const vangle = (Math.random() * 0.4 - 0.2); // rotation degrees per frame
    const opacity = (Math.random() * 0.08) + 0.04; // 0.04 to 0.12 opacity

    el.style.position = 'absolute';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = '0';
    el.style.top = '0';
    el.style.color = `rgba(99, 102, 241, ${opacity})`;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`;

    container.appendChild(el);

    floatingObjects.push({
      element: el,
      x: x + radius, // center point x
      y: y + radius, // center point y
      vx,
      vy,
      radius,
      mass: radius, // mass proportional to size
      angle,
      vangle
    });
  }

  if (window.lucide) {
    window.lucide.createIcons({
      attrs: { 'stroke-width': 1.5 }
    });
  }

  // Start the animation & physics frame loop
  updatePhysics();
}

// Zero-gravity space physics engine: manages movement, wall bounds, and elastic circle collisions
function updatePhysics() {
  let width = window.innerWidth || 1200;
  let height = window.innerHeight || 800;
  if (width < 300) width = 1200;
  if (height < 300) height = 800;

  // Move objects and keep within screen boundaries
  for (let i = 0; i < floatingObjects.length; i++) {
    const obj = floatingObjects[i];

    obj.x += obj.vx;
    obj.y += obj.vy;
    obj.angle += obj.vangle;

    // Bounce off left/right walls
    if (obj.x - obj.radius < 0) {
      obj.x = obj.radius;
      obj.vx = Math.abs(obj.vx);
    } else if (obj.x + obj.radius > width) {
      obj.x = width - obj.radius;
      obj.vx = -Math.abs(obj.vx);
    }

    // Bounce off top/bottom walls
    if (obj.y - obj.radius < 0) {
      obj.y = obj.radius;
      obj.vy = Math.abs(obj.vy);
    } else if (obj.y + obj.radius > height) {
      obj.y = height - obj.radius;
      obj.vy = -Math.abs(obj.vy);
    }
  }

  // Resolve elastic collisions between drifting objects
  for (let i = 0; i < floatingObjects.length; i++) {
    for (let j = i + 1; j < floatingObjects.length; j++) {
      const obj1 = floatingObjects[i];
      const obj2 = floatingObjects[j];

      const dx = obj2.x - obj1.x;
      const dy = obj2.y - obj1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = obj1.radius + obj2.radius;

      if (dist < minDist) {
        // 1. Position correction (push overlapping items apart)
        const overlap = minDist - dist;
        
        let nx = 0;
        let ny = 0;
        if (dist <= 0.001) {
          // Prevent division by zero if objects spawn/arrive at the exact same location
          const randAngle = Math.random() * Math.PI * 2;
          nx = Math.cos(randAngle);
          ny = Math.sin(randAngle);
        } else {
          nx = dx / dist;
          ny = dy / dist;
        }

        const totalMass = obj1.mass + obj2.mass;
        const ratio1 = obj2.mass / totalMass;
        const ratio2 = obj1.mass / totalMass;

        obj1.x -= nx * overlap * ratio1;
        obj1.y -= ny * overlap * ratio1;
        obj2.x += nx * overlap * ratio2;
        obj2.y += ny * overlap * ratio2;

        // 2. Elastic bounce calculation
        const kx = obj1.vx - obj2.vx;
        const ky = obj1.vy - obj2.vy;
        const vn = kx * nx + ky * ny; // relative velocity along collision normal

        // Bounce only if objects are moving towards each other
        if (vn > 0) {
          const impulse = (2 * vn) / totalMass;

          obj1.vx -= impulse * obj2.mass * nx;
          obj1.vy -= impulse * obj2.mass * ny;
          obj2.vx += impulse * obj1.mass * nx;
          obj2.vy += impulse * obj1.mass * ny;

          // Swap a portion of rotational velocity to make collisions look tangible
          const tempVangle = obj1.vangle;
          obj1.vangle = obj2.vangle * 0.75 + (Math.random() * 0.08 - 0.04);
          obj2.vangle = tempVangle * 0.75 + (Math.random() * 0.08 - 0.04);
        }
      }
    }
  }

  // Render updated positions with GPU acceleration
  for (let i = 0; i < floatingObjects.length; i++) {
    const obj = floatingObjects[i];
    const tx = obj.x - obj.radius;
    const ty = obj.y - obj.radius;
    obj.element.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotate(${obj.angle}deg)`;
  }

  animFrameId = requestAnimationFrame(updatePhysics);
}

// ----------------------------------------------------
// API INTEGRATIONS
// ----------------------------------------------------

async function fetchGames() {
  showLibraryLoading();
  try {
    const res = await fetch('/api/games');
    if (!res.ok) throw new Error("Failed to fetch games database.");
    const payload = await res.json();
    if (!Array.isArray(payload)) throw new Error("Unexpected response from the games API.");
    games = payload;
    hasLoadedGames = true;
    loadFailed = false;

    // Extract unique platforms to populate drop-downs
    populatePlatformDropdowns();

    // Refresh library render
    renderLibrary();

    // Refresh stats panel & sidebar counters
    fetchStats();
  } catch (error) {
    hasLoadedGames = true;
    loadFailed = true;
    renderLibrary();
    showToast(error.message, 'error');
  }
}

// Skeleton placeholders while the collection is in flight
function showLibraryLoading() {
  if (hasLoadedGames) return;
  emptyState.style.display = 'none';
  gamesGrid.style.display = 'grid';
  gamesGrid.innerHTML = Array.from({ length: 8 })
    .map(() => `<div class="game-card-skeleton" aria-hidden="true"></div>`)
    .join('');
  gamesGrid.setAttribute('aria-busy', 'true');
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error("Failed to fetch stats.");
    const stats = await res.json();
    updateStatsUI(stats);
  } catch (error) {
    console.error("Stats fetching error:", error);
  }
}

async function saveGame(gameData) {
  const isEdit = !!gameData.id;
  const url = isEdit ? `/api/games/${gameData.id}` : '/api/games';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameData)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save game.");
    }

    const savedGame = await res.json();
    showToast(isEdit ? `Successfully updated "${savedGame.title}"` : `Successfully added "${savedGame.title}"`, 'success');
    
    closeModal(gameModal);
    fetchGames(); // Re-fetch to sync
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteGame(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;

  const confirmed = await askConfirmation({
    title: 'Delete game',
    message: `Are you sure you want to delete <strong>${escapeHTML(game.title)}</strong>? This action cannot be undone.`,
    confirmLabel: 'Delete'
  });
  if (!confirmed) return;

  const title = game.title;

  try {
    const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error("Failed to delete game from server.");
    
    showToast(`Deleted "${title}"`, 'info');
    fetchGames();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ----------------------------------------------------
// UI RENDERING ENGINE
// ----------------------------------------------------

function renderLibrary() {
  // Apply Search, Status, Platform, Format Filters
  let filtered = games.filter(game => {
    // 1. Search Query
    if (activeFilters.search) {
      const query = activeFilters.search.toLowerCase();
      const matchTitle = (game.title || '').toLowerCase().includes(query);
      const matchGenre = (game.genre || '').toLowerCase().includes(query);
      const matchNotes = (game.notes || '').toLowerCase().includes(query);
      const matchPlatform = (game.platform || '').toLowerCase().includes(query);
      if (!matchTitle && !matchGenre && !matchNotes && !matchPlatform) return false;
    }

    // 2. Status Filter
    if (activeFilters.status !== 'All') {
      if (game.status !== activeFilters.status) return false;
    }

    // 3. Platform Filter
    if (activeFilters.platform !== 'All') {
      if (game.platform !== activeFilters.platform) return false;
    }

    // 4. Format Filter
    if (activeFilters.format !== 'All') {
      if (activeFilters.format === 'Physical') {
        if (!game.format || !game.format.toLowerCase().includes('physical')) return false;
      } else {
        // Specific digital storefront
        if (game.format !== activeFilters.format) return false;
      }
    }

    return true;
  });

  // Apply Sorting. Numeric sorts fall back to title so equal values (a shelf
  // full of unplayed, unrated backlog games) still come out in a stable order.
  const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '');
  filtered.sort((a, b) => {
    if (sortBy === 'title-asc') {
      return byTitle(a, b);
    } else if (sortBy === 'title-desc') {
      return byTitle(b, a);
    } else if (sortBy === 'playtime-desc') {
      return ((b.playtime || 0) - (a.playtime || 0)) || byTitle(a, b);
    } else if (sortBy === 'rating-desc') {
      return ((b.rating || 0) - (a.rating || 0)) || byTitle(a, b);
    } else if (sortBy === 'release-desc') {
      return ((b.releaseYear || 0) - (a.releaseYear || 0)) || byTitle(a, b);
    } else if (sortBy === 'added-asc') {
      return (new Date(a.addedAt || 0) - new Date(b.addedAt || 0)) || byTitle(a, b);
    } else { // 'added-desc' (default)
      return (new Date(b.addedAt || 0) - new Date(a.addedAt || 0)) || byTitle(a, b);
    }
  });

  // Update Badge and Text Views
  libraryCountBadge.textContent = `${filtered.length} Game${filtered.length === 1 ? '' : 's'}`;
  
  let filterText = activeFilters.status === 'All' ? 'All Games' : `${activeFilters.status} Games`;
  if (activeFilters.platform !== 'All') filterText += ` on ${activeFilters.platform}`;
  if (activeFilters.format !== 'All') {
    const formatName = activeFilters.format.includes('Digital') ? activeFilters.format.replace('Digital - ', '') : 'Physical';
    filterText += ` (${formatName})`;
  }
  libraryCurrentView.textContent = filterText;

  // Toggle empty states
  gamesGrid.removeAttribute('aria-busy');
  if (filtered.length === 0) {
    gamesGrid.innerHTML = ''; // drop the previous result set from the DOM
    gamesGrid.style.display = 'none';
    emptyState.style.display = 'flex';
    renderEmptyState();
  } else {
    gamesGrid.style.display = 'grid';
    emptyState.style.display = 'none';

    // Generate Cards
    gamesGrid.innerHTML = filtered.map(game => createGameCardHTML(game)).join('');

    // Compile Lucide icons on newly added nodes
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Update active filter tags display
  renderFilterTags();
}

// The empty state means two very different things: a brand new library, or a
// filter combination with no matches. Say which.
function renderEmptyState() {
  const hasFilters = activeFilters.search !== '' ||
    activeFilters.status !== 'All' ||
    activeFilters.platform !== 'All' ||
    activeFilters.format !== 'All';

  const heading = emptyState.querySelector('h3');
  const body = emptyState.querySelector('p');
  const actionBtn = emptyState.querySelector('#empty-state-add-btn');

  if (loadFailed) {
    // Never imply the collection is gone when the request simply failed
    heading.textContent = "Couldn't load your collection";
    body.textContent = "The server did not return your library. Your data is still on disk — check that the server is running, then try again.";
    actionBtn.querySelector('span').textContent = 'Retry';
    actionBtn.dataset.action = 'retry';
  } else if (games.length > 0 && hasFilters) {
    heading.textContent = 'No games match these filters';
    body.textContent = "Nothing in your collection matches the current search and filters. Try widening them, or clear them to see everything again.";
    actionBtn.querySelector('span').textContent = 'Clear Filters';
    actionBtn.dataset.action = 'clear-filters';
  } else {
    heading.textContent = 'Your library is empty';
    body.textContent = "Add your first game to start tracking your backlog, playtime and completions across every platform you own.";
    actionBtn.querySelector('span').textContent = 'Add New Game';
    actionBtn.dataset.action = 'add-game';
  }
}

function createGameCardHTML(game) {
  const ratingStars = renderStarsBlock(game.rating);
  const statusLower = (game.status || 'backlog').toLowerCase();
  const isTrackingThisGame = activeSession && activeSession.gameId === game.id;
  
  // Format visual tag
  let formatText = game.format || 'Physical';
  let formatIcon = 'package';
  if (formatText.includes('Digital')) {
    formatIcon = 'cloud';
    formatText = formatText.replace('Digital - ', '');
  }

  const safeTitle = escapeHTML(game.title);
  const safeCoverUrl = safeImageURL(game.coverUrl);
  const safePlatform = escapeHTML(game.platform);
  const safeStatus = escapeHTML(game.status);
  const safeFormatText = escapeHTML(formatText);
  const safeId = escapeHTML(game.id);
  const gradient = coverGradient(game.title);

  // Cover image container
  let coverHTML = '';
  if (safeCoverUrl) {
    coverHTML = `<img src="${safeCoverUrl}" alt="" class="game-cover-img" loading="lazy" data-cover-img>`;
  }

  // The fallback always sits underneath the cover, so a broken image URL simply
  // reveals the procedural gradient instead of leaving a blank tile.
  const fallbackHTML = `
    <div class="game-cover-fallback" style="background: ${gradient.background};">
      <i data-lucide="gamepad-2" class="fallback-icon" style="color: ${gradient.accent};"></i>
      <span class="fallback-title">${safeTitle}</span>
    </div>
  `;

  return `
    <article class="game-card ${isTrackingThisGame ? 'tracking-active' : ''}" data-id="${safeId}" tabindex="0" role="button" aria-label="${safeTitle} — view details">
      <div class="game-cover-wrapper">
        ${coverHTML}
        ${fallbackHTML}

        <!-- Hover actions overlay -->
        <div class="game-card-actions-overlay">
          <button type="button" class="action-circle-btn timer-btn ${isTrackingThisGame ? 'active' : ''}" data-action="timer" data-game-id="${safeId}" title="${isTrackingThisGame ? 'Save tracking session' : 'Start playtime tracking'}" aria-label="${isTrackingThisGame ? 'Save tracking session for' : 'Start playtime tracking for'} ${safeTitle}">
            <i data-lucide="${isTrackingThisGame ? 'pause' : 'play-circle'}"></i>
          </button>
          <button type="button" class="action-circle-btn edit-btn" data-action="edit" data-game-id="${safeId}" title="Edit game" aria-label="Edit ${safeTitle}">
            <i data-lucide="edit-3"></i>
          </button>
          <button type="button" class="action-circle-btn delete-btn" data-action="delete" data-game-id="${safeId}" title="Delete game" aria-label="Delete ${safeTitle}">
            <i data-lucide="trash-2"></i>
          </button>
        </div>

        <!-- Badges on cover -->
        <div class="card-badges">
          <span class="badge-status ${statusLower}">${safeStatus}</span>
          <span class="badge-format">
            <i data-lucide="${formatIcon}" style="width: 10px; height: 10px;"></i>
            <span>${safeFormatText}</span>
          </span>
        </div>
      </div>

      <div class="game-card-details">
        <div class="game-title-row">
          <h4 title="${safeTitle}">${safeTitle}</h4>
          ${ratingStars}
        </div>

        <div class="game-meta-row">
          <!-- The cover badge is hidden in list view, where this one takes over -->
          <span class="badge-status badge-status-inline ${statusLower}">${safeStatus}</span>
          <span class="game-platform-pill">${safePlatform}</span>
          ${game.releaseYear ? `<span class="game-release-year">${escapeHTML(game.releaseYear)}</span>` : ''}
        </div>

        <div class="game-card-playtime">
          <div class="playtime-display">
            <i data-lucide="clock"></i>
            <span>Playtime: <span class="time-val">${formatHours(game.playtime)}</span></span>
          </div>
        </div>
      </div>
    </article>
  `;
}

function generateStarsHTML(rating) {
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += `<i data-lucide="star" class="${i <= rating ? 'filled' : ''}"></i>`;
  }
  return stars;
}

// Star icons are decorative; the rating is announced through the label instead
function renderStarsBlock(rating) {
  const value = rating || 0;
  const label = value > 0 ? `Rated ${value} out of 5` : 'Not rated yet';
  return `<div class="stars-display" role="img" aria-label="${label}">${generateStarsHTML(value)}</div>`;
}

// ----------------------------------------------------
// STATISTICS AND CHARTS UPDATE
// ----------------------------------------------------

function updateStatsUI(stats) {
  // Update sidebar mini counters
  miniTotalGames.textContent = stats.totalGames;
  miniTotalPlaytime.textContent = `${Math.round(stats.totalPlaytime)}h`;

  // Update Status Grid counts
  countBacklog.textContent = stats.statusCounts.Backlog || 0;
  countPlaying.textContent = stats.statusCounts.Playing || 0;
  countCompleted.textContent = stats.statusCounts.Completed || 0;
  countAbandoned.textContent = stats.statusCounts.Abandoned || 0;

  // Update Analysis values if active
  const totalGamesVal = document.getElementById('stats-total-games');
  if (totalGamesVal) totalGamesVal.textContent = stats.totalGames;
  
  const totalHoursVal = document.getElementById('stats-total-hours');
  if (totalHoursVal) totalHoursVal.textContent = `${Math.round(stats.totalPlaytime)}h`;

  // Average Rating (computed server-side over the games that carry a rating)
  const avgRatingVal = document.getElementById('stats-average-rating');
  if (avgRatingVal) {
    avgRatingVal.textContent = (stats.averageRating || 0).toFixed(1);
  }

  // Format Breakdown visualization
  const totalFormat = stats.formatCounts.Physical + stats.formatCounts.Digital;
  const physPct = totalFormat > 0 ? (stats.formatCounts.Physical / totalFormat) * 100 : 0;
  const digPct = totalFormat > 0 ? (stats.formatCounts.Digital / totalFormat) * 100 : 0;

  const barPhysical = document.getElementById('format-bar-physical');
  const barDigital = document.getElementById('format-bar-digital');
  const valPhysical = document.getElementById('format-val-physical');
  const valDigital = document.getElementById('format-val-digital');

  if (barPhysical && barDigital) {
    barPhysical.style.width = `${physPct}%`;
    barDigital.style.width = `${digPct}%`;
    valPhysical.textContent = `${stats.formatCounts.Physical} Physical (${Math.round(physPct)}%)`;
    valDigital.textContent = `${stats.formatCounts.Digital} Digital (${Math.round(digPct)}%)`;
  }

  // Completion Rate circle progress
  const totalMinusAbandoned = stats.totalGames - (stats.statusCounts.Abandoned || 0);
  const completed = stats.statusCounts.Completed || 0;
  const compRate = totalMinusAbandoned > 0 ? Math.round((completed / totalMinusAbandoned) * 100) : 0;

  const circleFill = document.getElementById('completion-circle-fill');
  const circleText = document.getElementById('completion-circle-text');

  if (circleFill && circleText) {
    circleFill.setAttribute('stroke-dasharray', `${compRate}, 100`);
    circleText.textContent = `${compRate}%`;
  }

  // CSS bar charts for Platform Distribution
  const platformChart = document.getElementById('analytics-platform-chart');
  if (platformChart) {
    // Sort platforms by count descending
    const platformSorted = Object.entries(stats.platformCounts).sort((a, b) => b[1] - a[1]);
    
    if (platformSorted.length === 0) {
      platformChart.innerHTML = `<p class="text-muted text-center py-4">No platform data available.</p>`;
    } else {
      const maxCount = platformSorted[0][1];
      platformChart.innerHTML = platformSorted.map(([plat, count]) => {
        const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const safePlat = escapeHTML(plat);
        return `
          <div class="chart-bar-row">
            <div class="chart-bar-info">
              <span class="chart-bar-label">${safePlat}</span>
              <span class="chart-bar-value">${count} game${count === 1 ? '' : 's'}</span>
            </div>
            <div class="chart-bar-track">
              <div class="chart-bar-fill gradient-bar" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Platform list in Sidebar footer
  const sidebarPlatformsList = document.getElementById('sidebar-platforms');
  if (sidebarPlatformsList) {
    const platformEntries = Object.entries(stats.platformCounts).sort((a, b) => b[1] - a[1]);
    if (platformEntries.length === 0) {
      sidebarPlatformsList.innerHTML = `<li class="text-dark" style="font-size: 12px; padding: 4px 8px;">None added yet</li>`;
    } else {
      sidebarPlatformsList.innerHTML = platformEntries.map(([plat, count]) => `
        <li>
          <button type="button" class="sidebar-list-item" data-platform="${escapeHTML(plat)}" aria-label="Show only ${escapeHTML(plat)} games">
            <span>${escapeHTML(plat)}</span>
            <span class="badge">${count}</span>
          </button>
        </li>
      `).join('');
    }
  }
}

// ----------------------------------------------------
// PLAYTIME LIVE TIMER (MICRO-FEATURE WITH RECOVERY)
// ----------------------------------------------------

function initSessionTimer() {
  const savedSession = localStorage.getItem('gamevault_active_session');
  if (savedSession) {
    try {
      activeSession = JSON.parse(savedSession);
      if (activeSession && activeSession.gameId) {
        startTimerTicker();
        const bar = document.getElementById('session-timer-bar');
        if (bar) bar.classList.add('show');
      }
    } catch (e) {
      localStorage.removeItem('gamevault_active_session');
      activeSession = null;
    }
  }
}

function startPlayTimer(gameId) {
  const game = games.find(g => g.id === gameId);
  if (!game) return;

  if (activeSession) {
    if (activeSession.gameId === gameId) return;
    // Auto-save previous active session before starting new one
    savePlayTimerSession(true);
  }

  activeSession = {
    gameId: game.id,
    startTime: Date.now(),
    accumulatedMs: 0
  };

  localStorage.setItem('gamevault_active_session', JSON.stringify(activeSession));
  startTimerTicker();

  const bar = document.getElementById('session-timer-bar');
  if (bar) bar.classList.add('show');

  renderLibrary();
  showToast(`Started session tracking for "${game.title}"`, 'success');
}

function startTimerTicker() {
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);
  updateTimerDisplay();
  sessionTimerInterval = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  if (!activeSession) return;

  const game = games.find(g => g.id === activeSession.gameId);
  const titleEl = document.getElementById('session-timer-game-title');
  const clockEl = document.getElementById('session-timer-clock');

  if (titleEl) titleEl.textContent = game ? game.title : 'Active Game';

  const now = Date.now();
  const elapsedMs = (now - activeSession.startTime) + (activeSession.accumulatedMs || 0);
  
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = n => n.toString().padStart(2, '0');
  if (clockEl) {
    clockEl.textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
}

async function savePlayTimerSession(isAutoSave = false) {
  if (!activeSession) return;

  const now = Date.now();
  const elapsedMs = (now - activeSession.startTime) + (activeSession.accumulatedMs || 0);
  const gameId = activeSession.gameId;

  // Stop session
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);
  sessionTimerInterval = null;
  localStorage.removeItem('gamevault_active_session');

  const bar = document.getElementById('session-timer-bar');
  if (bar) bar.classList.remove('show');

  activeSession = null;

  const game = games.find(g => g.id === gameId);
  if (!game) {
    renderLibrary();
    return;
  }

  // Calculate elapsed hours (rounded to 1 decimal place, minimum 0.1h if session > 1 min)
  let elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours < 0.05 && elapsedMs > 60000) {
    elapsedHours = 0.1;
  } else {
    elapsedHours = Math.round(elapsedHours * 10) / 10;
  }

  if (elapsedHours > 0) {
    const updatedPlaytime = Math.round(((game.playtime || 0) + elapsedHours) * 10) / 10;
    const updatedGame = { ...game, playtime: updatedPlaytime };

    try {
      const res = await fetch(`/api/games/${gameId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedGame)
      });

      if (res.ok) {
        showToast(`Saved session! Added +${formatHours(elapsedHours)} to "${game.title}"`, 'success');
        fetchGames();
        return;
      }
    } catch (err) {
      console.error("Failed to save session playtime:", err);
    }
  } else {
    if (!isAutoSave) {
      showToast(`Session under 1 minute; no playtime added to "${game.title}".`, 'info');
    }
  }

  renderLibrary();
}

function discardPlayTimerSession() {
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);
  sessionTimerInterval = null;
  localStorage.removeItem('gamevault_active_session');

  const bar = document.getElementById('session-timer-bar');
  if (bar) bar.classList.remove('show');

  activeSession = null;
  renderLibrary();
  showToast("Session tracking discarded.", "info");
}

// ----------------------------------------------------
// FILTERING AND DROPDOWNS POPULATION
// ----------------------------------------------------

function populatePlatformDropdowns() {
  // Extract all unique platform values from library
  const currentPlatforms = Array.from(new Set(games.map(g => g.platform))).filter(Boolean).sort();
  
  // Preset list of standard modern platforms
  const presets = ["PC", "Nintendo Switch", "PlayStation 5", "PlayStation 4", "Xbox Series X/S", "Xbox One", "Retro"];
  const combinedPlatforms = Array.from(new Set([...presets, ...currentPlatforms])).sort();

  // Platform names are user-supplied, so they are escaped before reaching innerHTML
  const optionsHTML = combinedPlatforms
    .map(plat => `<option value="${escapeHTML(plat)}">${escapeHTML(plat)}</option>`)
    .join('');

  // Populate Filter Platforms Dropdown
  const filterVal = filterPlatform.value;
  filterPlatform.innerHTML = `<option value="All">All Platforms</option>${optionsHTML}`;
  filterPlatform.value = filterVal;
  if (!filterPlatform.value) {
    // The previously selected platform no longer exists in the collection
    filterPlatform.value = 'All';
    activeFilters.platform = 'All';
  }

  // Populate Modal Game Platform Selector
  const currentSelectVal = gamePlatformSelect.value;
  gamePlatformSelect.innerHTML = `
    <option value="" disabled selected>Select Platform</option>
    ${optionsHTML}
    <option value="CUSTOM_ADD">+ Add Custom Platform</option>
  `;
  gamePlatformSelect.value = currentSelectVal; // Restore selected modal platform
}

function filterByPlatformDirect(platName) {
  filterPlatform.value = platName;
  activeFilters.platform = platName;
  
  // Show library view if user is looking at analysis view
  showLibraryView();
  renderLibrary();
}

function renderFilterTags() {
  const tags = [];
  
  if (activeFilters.status !== 'All') {
    tags.push({ key: 'status', label: `Status: ${activeFilters.status}` });
  }
  if (activeFilters.platform !== 'All') {
    tags.push({ key: 'platform', label: `Platform: ${activeFilters.platform}` });
  }
  if (activeFilters.format !== 'All') {
    let fLabel = activeFilters.format;
    if (fLabel.includes('Digital - ')) fLabel = fLabel.replace('Digital - ', '');
    tags.push({ key: 'format', label: `Format: ${fLabel}` });
  }

  if (tags.length > 0) {
    activeFiltersContainer.style.display = 'flex';
    filterTagsList.innerHTML = tags.map(tag => `
      <div class="filter-tag">
        <span>${escapeHTML(tag.label)}</span>
        <button type="button" data-filter-key="${tag.key}" aria-label="Remove filter ${escapeHTML(tag.label)}"><i data-lucide="x" style="width: 12px; height: 12px;"></i></button>
      </div>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
  } else {
    activeFiltersContainer.style.display = 'none';
  }
}

function clearAllFilters() {
  activeFilters.search = '';
  activeFilters.status = 'All';
  activeFilters.platform = 'All';
  activeFilters.format = 'All';

  // Reset controls
  searchInput.value = '';
  searchClearBtn.style.display = 'none';
  filterPlatform.value = 'All';
  filterFormat.value = 'All';
  clearStatusCardSelection();

  renderLibrary();
}

function clearStatusCardSelection() {
  document.querySelectorAll('.status-card').forEach(c => {
    c.classList.remove('active-filter');
    c.setAttribute('aria-pressed', 'false');
  });
}

function removeFilterTag(key) {
  if (key === 'status') {
    activeFilters.status = 'All';
    clearStatusCardSelection();
  } else if (key === 'platform') {
    activeFilters.platform = 'All';
    filterPlatform.value = 'All';
  } else if (key === 'format') {
    activeFilters.format = 'All';
    filterFormat.value = 'All';
  }
  renderLibrary();
}

// ----------------------------------------------------
// EVENT LISTENERS HANDLER
// ----------------------------------------------------

function setupEventListeners() {

  // A cover URL that 404s should reveal the procedural fallback underneath it.
  // The page CSP forbids inline handlers, and `error` does not bubble, so this
  // is registered once in the capture phase for every cover image on the page.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.hasAttribute('data-cover-img')) {
      img.remove();
    }
  }, true);


  // Search input. Rendering rebuilds every card and recompiles the icon set, so
  // it is debounced rather than run on every keystroke.
  const runSearch = debounce(() => renderLibrary(), 180);
  searchInput.addEventListener('input', (e) => {
    activeFilters.search = e.target.value.trim();
    searchClearBtn.style.display = activeFilters.search.length > 0 ? 'flex' : 'none';
    // Searching from the analytics page is a request to see matching games
    if (activeFilters.search && analysisSection.style.display === 'block') {
      showLibraryView();
    }
    runSearch();
  });

  // Search input clear button
  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    activeFilters.search = '';
    searchClearBtn.style.display = 'none';
    renderLibrary();
  });

  // Filter Select drop-downs
  filterPlatform.addEventListener('change', (e) => {
    activeFilters.platform = e.target.value;
    renderLibrary();
  });

  filterFormat.addEventListener('change', (e) => {
    activeFilters.format = e.target.value;
    renderLibrary();
  });

  // Sorting (persisted alongside the view mode)
  sortBySelect.addEventListener('change', (e) => {
    sortBy = e.target.value;
    localStorage.setItem('gamevault_sort_by', sortBy);
    renderLibrary();
  });

  // View Mode Toggles
  viewGridBtn.addEventListener('click', () => {
    viewMode = 'grid';
    updateViewModeButtons();
    renderLibrary();
  });

  viewListBtn.addEventListener('click', () => {
    viewMode = 'list';
    updateViewModeButtons();
    renderLibrary();
  });

  // Status Cards Filter (dashboard cards act as toggle buttons)
  document.querySelectorAll('.status-card').forEach(card => {
    card.addEventListener('click', () => {
      const status = card.getAttribute('data-filter-status');

      // If already active, toggle it off
      const isActive = activeFilters.status === status;
      document.querySelectorAll('.status-card').forEach(c => {
        c.classList.remove('active-filter');
        c.setAttribute('aria-pressed', 'false');
      });

      if (isActive) {
        activeFilters.status = 'All';
      } else {
        activeFilters.status = status;
        card.classList.add('active-filter');
        card.setAttribute('aria-pressed', 'true');
      }

      showLibraryView();
      renderLibrary();
    });
  });

  // Clear all active filters button
  clearAllFiltersBtn.addEventListener('click', clearAllFilters);

  // Event delegation for filter tag remove buttons
  filterTagsList.addEventListener('click', (e) => {
    const tagBtn = e.target.closest('[data-filter-key]');
    if (!tagBtn) return;
    removeFilterTag(tagBtn.getAttribute('data-filter-key'));
  });

  // Event delegation for sidebar platform quick-filter
  const sidebarPlatformsList = document.getElementById('sidebar-platforms');
  if (sidebarPlatformsList) {
    sidebarPlatformsList.addEventListener('click', (e) => {
      const item = e.target.closest('[data-platform]');
      if (!item) return;
      filterByPlatformDirect(item.getAttribute('data-platform'));
    });
  }

  // Add Game Modal opening trigger
  document.getElementById('add-game-btn').addEventListener('click', () => {
    openAddGameModal();
  });
  // The empty-state button either adds a game or clears the filters that hid them
  emptyStateAddBtn.addEventListener('click', () => {
    const action = emptyStateAddBtn.dataset.action;
    if (action === 'clear-filters') {
      clearAllFilters();
    } else if (action === 'retry') {
      fetchGames();
    } else {
      openAddGameModal();
    }
  });

  // Event delegation for dynamically rendered game cards and actions
  gamesGrid.addEventListener('click', (e) => {
    // 1. Check if the click is on an action button (Edit / Delete / Timer)
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');
      const gameId = actionBtn.getAttribute('data-game-id');
      if (!gameId) return;

      e.stopPropagation();

      switch (action) {
        case 'timer':
          if (activeSession && activeSession.gameId === gameId) {
            savePlayTimerSession();
          } else {
            startPlayTimer(gameId);
          }
          break;
        case 'edit':
          openEditGameModal(gameId);
          break;
        case 'delete':
          deleteGame(gameId);
          break;
      }
      return;
    }

    // 2. Otherwise, check if we clicked on the game card body to open details
    const gameCard = e.target.closest('.game-card');
    if (gameCard) {
      const gameId = gameCard.getAttribute('data-id');
      if (gameId) {
        openGameDetailsModal(gameId);
      }
    }
  });

  // Cards behave as buttons, so Enter/Space open the details view too
  gamesGrid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const gameCard = e.target.closest('.game-card');
    if (!gameCard || e.target !== gameCard) return;
    e.preventDefault();
    const gameId = gameCard.getAttribute('data-id');
    if (gameId) openGameDetailsModal(gameId);
  });

  // Modal Cancel triggers
  document.getElementById('modal-close-x').addEventListener('click', () => closeModal(gameModal));
  document.getElementById('modal-cancel-btn').addEventListener('click', () => closeModal(gameModal));
  
  // Rating Star Picker clicks inside modal form (using delegation to survive Lucide compiles)
  starsContainer.addEventListener('click', (e) => {
    const star = e.target.closest('[data-value]');
    if (!star) return;
    const ratingVal = parseInt(star.getAttribute('data-value'));
    setFormRatingStars(ratingVal);
  });

  // Custom Platform input toggler
  gamePlatformSelect.addEventListener('change', (e) => {
    if (e.target.value === 'CUSTOM_ADD') {
      customPlatformInput.style.display = 'block';
      customPlatformInput.setAttribute('required', 'true');
      customPlatformInput.focus();
    } else {
      customPlatformInput.style.display = 'none';
      customPlatformInput.removeAttribute('required');
      customPlatformInput.value = '';
    }
  });

  // Form submission handler
  gameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = gameIdInput.value;
    const title = document.getElementById('game-title').value.trim();
    
    // Get platform details (custom vs dropdown preset)
    let platform = gamePlatformSelect.value;
    if (platform === 'CUSTOM_ADD') {
      platform = customPlatformInput.value.trim();
    }

    const format = gameFormatSelect.value;
    const status = document.getElementById('game-status').value;
    const playtime = parseFloat(document.getElementById('game-playtime').value) || 0;
    const rating = parseInt(gameRatingInput.value) || 0;
    const releaseYear = document.getElementById('game-release').value;
    const genre = document.getElementById('game-genre').value.trim();
    const coverUrl = document.getElementById('game-cover').value.trim();
    const notes = document.getElementById('game-notes').value.trim();

    saveGame({
      id: id || undefined,
      title,
      platform,
      format,
      status,
      playtime,
      rating,
      releaseYear: releaseYear || undefined,
      genre,
      coverUrl,
      notes
    });
  });

  // Backup & Settings triggers
  settingsBtn.addEventListener('click', () => openModal(settingsModal));
  settingsCloseX.addEventListener('click', () => closeModal(settingsModal));

  // Drag & drop file import
  importDropzone.addEventListener('click', () => importFileInput.click());
  importDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    importDropzone.style.borderColor = 'var(--primary)';
  });
  importDropzone.addEventListener('dragleave', () => {
    importDropzone.style.borderColor = 'var(--glass-border)';
  });
  importDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    importDropzone.style.borderColor = 'var(--glass-border)';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImportFileSelect(files[0]);
    }
  });

  importFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleImportFileSelect(e.target.files[0]);
    }
  });

  removeImportFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetImportZone();
  });

  importSubmitBtn.addEventListener('click', () => {
    submitImportData();
  });

  // Sidebar navigation toggling views (Library vs Analysis)
  navAll.addEventListener('click', (e) => {
    e.preventDefault();
    showLibraryView();
  });

  navStatsTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    showAnalysisView();
  });

  backToLibraryBtn.addEventListener('click', () => {
    showLibraryView();
  });

  // Floating Live Session Timer bar action listeners
  const sessionSaveBtn = document.getElementById('session-save-btn');
  const sessionDiscardBtn = document.getElementById('session-discard-btn');
  if (sessionSaveBtn) sessionSaveBtn.addEventListener('click', () => savePlayTimerSession());
  if (sessionDiscardBtn) sessionDiscardBtn.addEventListener('click', () => discardPlayTimerSession());

  // Game Details Modal close triggers
  document.getElementById('details-close-x').addEventListener('click', () => closeModal(detailsModal));
  document.getElementById('details-close-btn').addEventListener('click', () => closeModal(detailsModal));

  // Shared confirmation dialog triggers
  document.getElementById('confirm-modal-close-x').addEventListener('click', () => resolveConfirmation(false));
  document.getElementById('confirm-modal-cancel-btn').addEventListener('click', () => resolveConfirmation(false));
  document.getElementById('confirm-modal-ok-btn').addEventListener('click', () => resolveConfirmation(true));

  // Close modals on clicking backdrop overlay
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target !== backdrop) return;
      if (backdrop.id === 'confirm-modal') {
        resolveConfirmation(false);
      } else {
        closeModal(backdrop);
      }
    });
  });

  // Close active modals on pressing Escape, and keep Tab inside the dialog
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-backdrop.show');
      if (activeModal) {
        if (activeModal.id === 'confirm-modal') {
          resolveConfirmation(false);
        } else {
          closeModal(activeModal);
        }
      }
      return;
    }
    trapFocus(e);
  });

  // Online Cover Art & Metadata Search handler
  const fetchCoverBtn = document.getElementById('fetch-cover-btn');
  const coverSearchResults = document.getElementById('cover-search-results');

  if (fetchCoverBtn && coverSearchResults) {
    fetchCoverBtn.addEventListener('click', async () => {
      const titleVal = document.getElementById('game-title').value.trim();
      if (!titleVal) {
        showToast("Please enter a game title to search.", "info");
        return;
      }

      // Display loading state on button and results container
      fetchCoverBtn.disabled = true;
      const originalBtnHTML = fetchCoverBtn.innerHTML;
      fetchCoverBtn.innerHTML = `<i data-lucide="loader" class="spin" style="width: 14px; height: 14px;"></i><span>Searching...</span>`;

      coverSearchResults.innerHTML = `
        <div class="cover-search-loading">
          <i data-lucide="loader"></i>
          <span>Searching online database...</span>
        </div>
      `;
      coverSearchResults.style.display = 'flex';
      if (window.lucide) window.lucide.createIcons();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      try {
        const res = await fetch(`/api/search-cover?q=${encodeURIComponent(titleVal)}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (res.status === 503) {
          const err = await res.json();
          coverSearchResults.innerHTML = `
            <div class="cover-search-error">
              <i data-lucide="alert-circle" style="color: var(--color-abandoned); width: 18px; height: 18px;"></i>
              <div style="text-align: left; max-width: 280px;">
                <p style="font-weight: 700; margin-bottom: 2px;">Feature Not Configured</p>
                <p style="font-size: 11px; color: var(--text-muted); line-height: 1.3;">${escapeHTML(err.error)}</p>
              </div>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
          return;
        }

        if (!res.ok) {
          throw new Error("Failed to fetch games from RAWG proxy.");
        }

        const results = await res.json();
        
        if (results.length === 0) {
          coverSearchResults.innerHTML = `
            <div class="cover-search-loading">
              <span>No matching games found.</span>
            </div>
          `;
          return;
        }

        // Render search results. Everything here comes from a third-party API,
        // so titles, genres and image URLs are all escaped/validated.
        coverSearchResults.innerHTML = results.map((game, index) => {
          const year = game.released ? new Date(game.released).getFullYear() : 'N/A';
          const imgSrc = safeImageURL(game.coverUrl);
          const thumb = imgSrc
            ? `<img src="${imgSrc}" alt="" class="cover-search-item-img" loading="lazy" data-cover-img>`
            : `<div class="cover-search-item-img is-placeholder" aria-hidden="true"></div>`;
          return `
            <button type="button" class="cover-search-item" data-index="${index}">
              ${thumb}
              <div class="cover-search-item-info">
                <span class="cover-search-item-title">${escapeHTML(game.name)}</span>
                <span class="cover-search-item-meta">${escapeHTML(year)} • ${escapeHTML(game.genres || 'Genres N/A')}</span>
              </div>
            </button>
          `;
        }).join('');

        // Bind clicks on search items
        coverSearchResults.querySelectorAll('.cover-search-item').forEach(item => {
          item.addEventListener('click', () => {
            const index = parseInt(item.getAttribute('data-index'));
            const game = results[index];

            // Fill inputs with online metadata
            document.getElementById('game-title').value = game.name;
            document.getElementById('game-cover').value = game.coverUrl;
            
            if (game.released) {
              document.getElementById('game-release').value = new Date(game.released).getFullYear();
            }
            if (game.genres) {
              const mainGenre = game.genres.split(', ')[0];
              document.getElementById('game-genre').value = mainGenre;
            }

            coverSearchResults.style.display = 'none';
            showToast(`Applied metadata for "${game.name}"`, "success");
          });
        });

      } catch (error) {
        clearTimeout(timeoutId);
        let errMsg = error.message;
        if (error.name === 'AbortError') {
          errMsg = "Request timed out (7s). Please try again.";
        }
        coverSearchResults.innerHTML = `
          <div class="cover-search-error">
            <i data-lucide="alert-triangle" style="color: var(--color-backlog); width: 18px; height: 18px;"></i>
            <span>Error: ${escapeHTML(errMsg)}</span>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
      } finally {
        clearTimeout(timeoutId);
        fetchCoverBtn.disabled = false;
        fetchCoverBtn.innerHTML = originalBtnHTML;
        if (window.lucide) window.lucide.createIcons();
      }
    });

    // Close search box on click outside
    document.addEventListener('click', (e) => {
      if (!coverSearchResults.contains(e.target) && !fetchCoverBtn.contains(e.target) && e.target !== document.getElementById('game-title')) {
        coverSearchResults.style.display = 'none';
      }
    });
  }
}

// ----------------------------------------------------
// UI NAVIGATION AND VIEW TABS
// ----------------------------------------------------

const libraryHeader = document.querySelector('.library-header');

function showLibraryView() {
  navAll.classList.add('active');
  navAll.setAttribute('aria-current', 'page');
  navStatsTrigger.classList.remove('active');
  navStatsTrigger.removeAttribute('aria-current');

  statsDashboard.style.display = 'grid';
  librarySection.style.display = 'block';
  if (libraryHeader) libraryHeader.style.display = 'flex';
  analysisSection.style.display = 'none';

  // The filter tag bar belongs to the library, not the analytics page
  renderFilterTags();
}

function showAnalysisView() {
  navAll.classList.remove('active');
  navAll.removeAttribute('aria-current');
  navStatsTrigger.classList.add('active');
  navStatsTrigger.setAttribute('aria-current', 'page');

  statsDashboard.style.display = 'none';
  librarySection.style.display = 'none';
  // The search/sort controls only act on the library grid, so they go with it
  if (libraryHeader) libraryHeader.style.display = 'none';
  activeFiltersContainer.style.display = 'none';
  analysisSection.style.display = 'block';

  // Re-fetch stats to draw analysis
  fetchStats();
}

function updateViewModeButtons() {
  localStorage.setItem('gamevault_view_mode', viewMode);
  
  const isList = viewMode === 'list';
  viewGridBtn.classList.toggle('active', !isList);
  viewListBtn.classList.toggle('active', isList);
  viewGridBtn.setAttribute('aria-pressed', String(!isList));
  viewListBtn.setAttribute('aria-pressed', String(isList));
  document.body.classList.toggle('list-view-active', isList);
}

// ----------------------------------------------------
// MODAL FORMS HANDLERS
// ----------------------------------------------------

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modals stack (details → delete confirmation), so remember which element to
// hand focus back to for each one.
const modalReturnFocus = new WeakMap();

function openModal(modalEl) {
  modalReturnFocus.set(modalEl, document.activeElement);
  modalEl.style.display = 'flex';
  modalEl.removeAttribute('aria-hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => {
    modalEl.classList.add('show');
    // Prefer the field the dialog is actually about over its close button
    const target = modalEl.querySelector('[data-autofocus]') || modalEl.querySelector(FOCUSABLE_SELECTOR);
    if (target) target.focus();
  }, 10);
}

function closeModal(modalEl) {
  modalEl.classList.remove('show');
  modalEl.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    modalEl.style.display = 'none';
    if (!document.querySelector('.modal-backdrop.show')) {
      document.body.classList.remove('modal-open');
    }
  }, 250);

  const returnTo = modalReturnFocus.get(modalEl);
  modalReturnFocus.delete(modalEl);
  if (returnTo && document.contains(returnTo)) {
    returnTo.focus();
  }
}

// Keeps Tab inside the topmost dialog
function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const modalEl = document.querySelector('.modal-backdrop.show');
  if (!modalEl) return;

  const focusable = Array.from(modalEl.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(el => el.offsetParent !== null || el === document.activeElement);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Promise-based confirmation dialog, styled like the rest of the app instead of
// falling back to window.confirm().
let pendingConfirm = null;

function askConfirmation({ title, message, confirmLabel = 'Confirm', danger = true }) {
  // Never strand an earlier promise if a second confirmation is somehow raised
  if (pendingConfirm) {
    const stale = pendingConfirm;
    pendingConfirm = null;
    stale(false);
  }

  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-message').innerHTML = message;

  const okBtn = document.getElementById('confirm-modal-ok-btn');
  okBtn.textContent = confirmLabel;
  okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

  openModal(modal);

  return new Promise(resolve => {
    pendingConfirm = resolve;
  });
}

function resolveConfirmation(result) {
  const modal = document.getElementById('confirm-modal');
  if (modal.classList.contains('show') || modal.style.display === 'flex') {
    closeModal(modal);
  }
  if (pendingConfirm) {
    const resolve = pendingConfirm;
    pendingConfirm = null;
    resolve(result);
  }
}

function openAddGameModal() {
  modalTitle.textContent = "Add New Game";
  gameForm.reset();
  gameIdInput.value = '';
  customPlatformInput.style.display = 'none';
  customPlatformInput.removeAttribute('required');
  customPlatformInput.value = '';
  gamePlatformSelect.value = '';
  document.getElementById('cover-search-results').style.display = 'none';
  setFormRatingStars(0);
  openModal(gameModal);
}

function openEditGameModal(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;

  modalTitle.textContent = "Edit Game Details";
  gameIdInput.value = game.id;
  document.getElementById('game-title').value = game.title;
  document.getElementById('cover-search-results').style.display = 'none';
  
  // Set platform select option or trigger custom
  const options = Array.from(gamePlatformSelect.options).map(o => o.value);
  if (options.includes(game.platform)) {
    gamePlatformSelect.value = game.platform;
    customPlatformInput.style.display = 'none';
    customPlatformInput.removeAttribute('required');
    customPlatformInput.value = ''; // don't leave a stale name behind the select
  } else {
    gamePlatformSelect.value = 'CUSTOM_ADD';
    customPlatformInput.value = game.platform;
    customPlatformInput.style.display = 'block';
    customPlatformInput.setAttribute('required', 'true');
  }

  gameFormatSelect.value = game.format || 'Physical';
  document.getElementById('game-status').value = game.status;
  document.getElementById('game-playtime').value = game.playtime || 0;
  
  // Set rating stars picker
  setFormRatingStars(game.rating || 0);

  document.getElementById('game-release').value = game.releaseYear || '';
  document.getElementById('game-genre').value = game.genre || '';
  document.getElementById('game-cover').value = game.coverUrl || '';
  document.getElementById('game-notes').value = game.notes || '';

  openModal(gameModal);
}

function setFormRatingStars(ratingVal) {
  gameRatingInput.value = ratingVal;
  starsContainer.querySelectorAll('[data-value]').forEach((star, index) => {
    const filled = index < ratingVal;
    star.classList.toggle('filled', filled);
    // The group is a radiogroup: exactly the chosen value reads as checked
    star.setAttribute('aria-checked', String(index + 1 === ratingVal));
  });
}

// ----------------------------------------------------
// IMPORT DATABASE UTILS
// ----------------------------------------------------

let importedFileContent = null;

function handleImportFileSelect(file) {
  if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
    showToast("Invalid file type. Please select a JSON backup file.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) {
        throw new Error("Backup file must be a JSON array representing game records.");
      }
      importedFileContent = data;
      
      // Update UI with file details
      importDropzone.style.display = 'none';
      importFilenameDisplay.style.display = 'flex';
      importFilenameText.textContent = `${file.name} (${data.length} games)`;
      importSubmitBtn.removeAttribute('disabled');
      
    } catch (err) {
      showToast(`Failed to parse file: ${err.message}`, "error");
      resetImportZone();
    }
  };
  reader.readAsText(file);
}

function resetImportZone() {
  importedFileContent = null;
  importFileInput.value = '';
  importDropzone.style.display = 'flex';
  importFilenameDisplay.style.display = 'none';
  importSubmitBtn.setAttribute('disabled', 'true');
}

async function submitImportData() {
  if (!importedFileContent) return;

  const confirmed = await askConfirmation({
    title: 'Overwrite library',
    message: `This will <strong>replace all ${games.length} games</strong> in your library with the ${importedFileContent.length} games in this backup. Anything not in the backup — including recent playtime — will be lost.`,
    confirmLabel: 'Overwrite Library'
  });
  if (!confirmed) return;

  // Discard active timer if running before import
  if (activeSession) {
    discardPlayTimerSession();
  }

  try {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importedFileContent)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Import request rejected by server.");
    }

    const reply = await res.json();
    showToast(reply.message || "Library imported successfully!", "success");
    
    // Close Settings
    closeModal(settingsModal);
    resetImportZone();
    
    // Sync state
    fetchGames();
  } catch (error) {
    showToast(error.message, "error");
  }
}

// ----------------------------------------------------
// FLOATING TOAST NOTIFICATION UTILS
// ----------------------------------------------------

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';

  // Toast text routinely carries game titles and server error strings — escape it
  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  // Slide-in animation
  setTimeout(() => toast.classList.add('show'), 50);

  // Auto remove toast
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ----------------------------------------------------
// STRING FORMATTING UTILS
// ----------------------------------------------------

function formatHours(hrs) {
  if (hrs === undefined || hrs === null) return '0h';
  if (hrs < 0.1 && hrs > 0) return '0.1h';
  return `${hrs.toFixed(1).replace('.0', '')}h`;
}

// ----------------------------------------------------
// GAME DETAILS VIEW MODAL
// ----------------------------------------------------

function openGameDetailsModal(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;

  // Set details labels
  detailsTitle.textContent = game.title;
  detailsStatus.textContent = game.status || 'Backlog';
  detailsStatus.className = `badge-status ${(game.status || 'backlog').toLowerCase()}`;
  detailsPlatform.textContent = game.platform;
  
  // Format storefront details
  let formatText = game.format || 'Physical';
  let formatIcon = 'package';
  if (formatText.includes('Digital')) {
    formatIcon = 'cloud';
    formatText = formatText.replace('Digital - ', '');
  }
  detailsFormat.innerHTML = `<i data-lucide="${formatIcon}" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 4px;"></i><span>${escapeHTML(formatText)}</span>`;

  detailsPlaytime.textContent = formatHours(game.playtime);
  detailsRelease.textContent = game.releaseYear || 'N/A';
  detailsGenre.textContent = game.genre || 'N/A';
  detailsRating.innerHTML = generateStarsHTML(game.rating || 0);
  detailsRating.setAttribute('role', 'img');
  detailsRating.setAttribute('aria-label', game.rating ? `Rated ${game.rating} out of 5` : 'Not rated yet');
  detailsNotes.textContent = game.notes || 'No review notes written yet.';

  // Procedural fallback sits behind the cover, so a broken URL degrades cleanly
  const gradient = coverGradient(game.title);
  const coverSrc = safeImageURL(game.coverUrl);
  detailsCoverContainer.innerHTML = `
    ${coverSrc ? `<img src="${coverSrc}" alt="" class="details-cover-img" data-cover-img>` : ''}
    <div class="details-cover-fallback" style="background: ${gradient.background};">
      <i data-lucide="gamepad-2" style="width: 32px; height: 32px; opacity: 0.8; color: ${gradient.accent};"></i>
      <span style="font-weight: 700; font-size: 13px; line-height: 1.3;">${escapeHTML(game.title)}</span>
    </div>
  `;

  // Bind Track Session button
  const trackBtn = document.getElementById('details-track-btn');
  if (trackBtn) {
    const isTracking = activeSession && activeSession.gameId === game.id;
    trackBtn.innerHTML = `
      <i data-lucide="${isTracking ? 'pause' : 'play-circle'}"></i>
      <span>${isTracking ? 'Save Session' : 'Track Session'}</span>
    `;
    trackBtn.onclick = (e) => {
      e.stopPropagation();
      closeModal(detailsModal);
      if (isTracking) {
        savePlayTimerSession();
      } else {
        startPlayTimer(game.id);
      }
    };
  }

  // Bind footer button callbacks
  detailsDeleteBtn.onclick = (e) => {
    e.stopPropagation();
    closeModal(detailsModal);
    deleteGame(game.id);
  };

  detailsEditBtn.onclick = (e) => {
    e.stopPropagation();
    closeModal(detailsModal);
    openEditGameModal(game.id);
  };

  if (window.lucide) {
    window.lucide.createIcons();
  }

  openModal(detailsModal);
}
