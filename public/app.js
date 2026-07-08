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

// Playtime Live Tracker State
let activeTimerId = null;
let activeTimerStart = null;
let timerInterval = null;

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
  // Fetch initial games database
  fetchGames();

  // Load view mode preference
  const savedViewMode = localStorage.getItem('gamevault_view_mode');
  if (savedViewMode) {
    viewMode = savedViewMode;
    updateViewModeButtons();
  }

  // Restore active timer if page was refreshed
  restoreActiveTimer();

  // Setup Event Listeners
  setupEventListeners();
  
  // Initial Lucide Icons compilation
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ----------------------------------------------------
// API INTEGRATIONS
// ----------------------------------------------------

async function fetchGames() {
  try {
    const res = await fetch('/api/games');
    if (!res.ok) throw new Error("Failed to fetch games database.");
    games = await res.json();
    
    // Extract unique platforms to populate drop-downs
    populatePlatformDropdowns();
    
    // Refresh library render
    renderLibrary();
    
    // Refresh stats panel & sidebar counters
    fetchStats();
  } catch (error) {
    showToast(error.message, 'error');
  }
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

async function deleteGame(id, title) {
  if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
    return;
  }

  // If deleting the currently tracked game, stop timer first
  if (activeTimerId === id) {
    stopPlayTimer(false); // Stop without saving
  }

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

  // Apply Sorting
  filtered.sort((a, b) => {
    if (sortBy === 'title-asc') {
      return a.title.localeCompare(b.title);
    } else if (sortBy === 'title-desc') {
      return b.title.localeCompare(a.title);
    } else if (sortBy === 'playtime-desc') {
      return (b.playtime || 0) - (a.playtime || 0);
    } else if (sortBy === 'rating-desc') {
      return (b.rating || 0) - (a.rating || 0);
    } else if (sortBy === 'release-desc') {
      return (b.releaseYear || 0) - (a.releaseYear || 0);
    } else if (sortBy === 'added-asc') {
      return new Date(a.addedAt || 0) - new Date(b.addedAt || 0);
    } else { // 'added-desc' (default)
      return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
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
  if (filtered.length === 0) {
    gamesGrid.style.display = 'none';
    emptyState.style.display = 'flex';
  } else {
    gamesGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    
    // Generate Cards
    gamesGrid.innerHTML = filtered.map(game => createGameCardHTML(game)).join('');
    
    // Compile Lucide icons on newly added nodes
    if (window.lucide) {
      window.lucide.createIcons();
    }
    
    // Attach dynamically calculated inline colors for fallback cover gradients
    filtered.forEach(game => {
      if (!game.coverUrl) {
        applyFallbackGradient(game.id, game.title);
      }
    });
  }

  // Update active filter tags display
  renderFilterTags();
}

function createGameCardHTML(game) {
  const isTrackingThis = activeTimerId === game.id;
  const ratingStars = generateStarsHTML(game.rating);
  const statusLower = (game.status || 'backlog').toLowerCase();
  
  // Format visual tag
  let formatText = game.format || 'Physical';
  let formatIcon = 'package';
  if (formatText.includes('Steam')) formatIcon = 'steam-logo'; // Fallback to play/gamepad if custom
  if (formatText.includes('Digital')) {
    formatIcon = 'cloud';
    formatText = formatText.replace('Digital - ', '');
  }

  // Cover image container
  let coverHTML = '';
  if (game.coverUrl) {
    coverHTML = `<img src="${game.coverUrl}" alt="${game.title} cover" class="game-cover-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`;
  }
  
  // We always build a fallback element in case image fails to load or doesn't exist
  const initials = getInitials(game.title);
  const fallbackHTML = `
    <div class="game-cover-fallback" id="fallback-${game.id}">
      <i data-lucide="gamepad-2" class="fallback-icon"></i>
      <span class="fallback-title">${game.title}</span>
    </div>
  `;

  return `
    <div class="game-card ${isTrackingThis ? 'tracking-active' : ''}" data-id="${game.id}">
      <div class="game-cover-wrapper">
        ${coverHTML}
        ${fallbackHTML}
        
        <!-- Hover actions overlay -->
        <div class="game-card-actions-overlay">
          <button class="action-circle-btn edit-btn" onclick="openEditGameModal('${game.id}')" title="Edit Game">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="action-circle-btn delete-btn" onclick="deleteGame('${game.id}', '${game.title.replace(/'/g, "\\'")}')" title="Delete Game">
            <i data-lucide="trash-2"></i>
          </button>
        </div>

        <!-- Badges on cover -->
        <div class="card-badges">
          <span class="badge-status ${statusLower}">${game.status}</span>
          <span class="badge-format">
            <i data-lucide="${formatIcon}" style="width: 10px; height: 10px;"></i>
            <span>${formatText}</span>
          </span>
        </div>
      </div>

      <div class="game-card-details">
        <div class="game-title-row">
          <h4 title="${game.title}">${game.title}</h4>
          <div class="stars-display">
            ${ratingStars}
          </div>
        </div>

        <div class="game-meta-row">
          <span class="game-platform-pill">${game.platform}</span>
          ${game.releaseYear ? `<span class="game-release-year">${game.releaseYear}</span>` : ''}
        </div>

        <div class="game-card-playtime">
          <div class="playtime-display">
            <i data-lucide="clock"></i>
            <span>Playtime: <span class="time-val" id="time-val-${game.id}">${formatHours(game.playtime)}</span></span>
          </div>
          <button class="game-play-btn ${isTrackingThis ? 'tracking' : ''}" 
                  onclick="togglePlayTime('${game.id}', event)" 
                  title="${isTrackingThis ? 'Stop tracking session' : 'Start playing'}">
            <i data-lucide="${isTrackingThis ? 'loader' : 'play'}"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function generateStarsHTML(rating) {
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += `<i data-lucide="star" class="${i <= rating ? 'filled' : ''}"></i>`;
  }
  return stars;
}

function getInitials(title) {
  if (!title) return "G";
  const words = title.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Applies a beautiful procedural color gradient based on string hashing
function applyFallbackGradient(elementId, title) {
  const fallbackEl = document.getElementById(`fallback-${elementId}`);
  if (!fallbackEl) return;

  // Simple string hash
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate 2 rich colors based on hash
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 60) % 360;
  
  fallbackEl.style.background = `linear-gradient(135deg, hsl(${h1}, 45%, 15%) 0%, hsl(${h2}, 45%, 8%) 100%)`;
  
  // Customize icon colors slightly
  const icon = fallbackEl.querySelector('.fallback-icon');
  if (icon) {
    icon.style.color = `hsl(${h1}, 70%, 65%)`;
    icon.style.opacity = '0.9';
  }
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

  // Calculate Average Rating
  let ratedGamesCount = 0;
  let totalRatingSum = 0;
  games.forEach(g => {
    if (g.rating > 0) {
      ratedGamesCount++;
      totalRatingSum += g.rating;
    }
  });
  const avgRatingVal = document.getElementById('stats-average-rating');
  if (avgRatingVal) {
    avgRatingVal.textContent = ratedGamesCount > 0 ? (totalRatingSum / ratedGamesCount).toFixed(1) : '0.0';
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
        return `
          <div class="chart-bar-row">
            <div class="chart-bar-info">
              <span class="chart-bar-label">${plat}</span>
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
        <li class="sidebar-list-item" onclick="filterByPlatformDirect('${plat}')">
          <span>${plat}</span>
          <span class="badge">${count}</span>
        </li>
      `).join('');
    }
  }
}

// ----------------------------------------------------
// PLAYTIME LIVE TIMER (MICRO-FEATURE WITH RECOVERY)
// ----------------------------------------------------

function togglePlayTime(gameId, event) {
  if (event) event.stopPropagation();

  if (activeTimerId === null) {
    // Start tracking playtime for this game
    startPlayTimer(gameId);
  } else if (activeTimerId === gameId) {
    // Stop tracking playtime
    stopPlayTimer(true);
  } else {
    // Stop tracking old game first, then start new one
    stopPlayTimer(true);
    startPlayTimer(gameId);
  }
}

function startPlayTimer(gameId) {
  const game = games.find(g => g.id === gameId);
  if (!game) return;

  activeTimerId = gameId;
  activeTimerStart = Date.now();

  // Save tracking state to localstorage to recover on reload
  localStorage.setItem('gamevault_active_timer_id', activeTimerId);
  localStorage.setItem('gamevault_active_timer_start', activeTimerStart.toString());

  // Update card UI
  renderLibrary();
  showToast(`Now tracking session for "${game.title}"`, 'success');

  // Trigger continuous UI updater for clock
  const timeValEl = document.getElementById(`time-val-${gameId}`);
  const initialTime = game.playtime;

  timerInterval = setInterval(() => {
    const elapsedHrs = (Date.now() - activeTimerStart) / 3600000;
    const totalTime = initialTime + elapsedHrs;
    if (timeValEl) {
      timeValEl.textContent = formatHours(totalTime);
    }
  }, 1000);
}

async function stopPlayTimer(shouldSave = true) {
  if (activeTimerId === null) return;

  clearInterval(timerInterval);
  timerInterval = null;

  const gameId = activeTimerId;
  const elapsedHrs = (Date.now() - activeTimerStart) / 3600000;
  
  // Clear states
  activeTimerId = null;
  activeTimerStart = null;
  localStorage.removeItem('gamevault_active_timer_id');
  localStorage.removeItem('gamevault_active_timer_start');

  const game = games.find(g => g.id === gameId);
  
  if (shouldSave && game && elapsedHrs > 0.001) { // Save session if it's more than a few seconds
    const addedTime = parseFloat(elapsedHrs.toFixed(2));
    const newPlaytime = parseFloat((game.playtime + addedTime).toFixed(2));
    
    showToast(`Play session ended for "${game.title}" (+${formatHours(addedTime)})`, 'info');

    // Sync back to database
    try {
      const res = await fetch(`/api/games/${gameId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playtime: newPlaytime, status: 'Playing' }) // Auto set to playing if tracking active session
      });
      
      if (!res.ok) throw new Error("Failed to save tracked playtime on server.");
      
      fetchGames(); // Re-sync entire frontend
    } catch (error) {
      showToast(error.message, 'error');
      renderLibrary(); // Re-render local state anyway to sync display
    }
  } else {
    // Just refresh view to reset buttons
    renderLibrary();
  }
}

function restoreActiveTimer() {
  const savedId = localStorage.getItem('gamevault_active_timer_id');
  const savedStart = localStorage.getItem('gamevault_active_timer_start');

  if (savedId && savedStart) {
    activeTimerId = savedId;
    activeTimerStart = parseInt(savedStart);
    
    // Re-trigger live timer update
    const game = games.find(g => g.id === activeTimerId);
    
    // We will start interval updates as soon as the games are loaded.
    // To do that, we hook it into renderLibrary() once games array is ready.
    // So let's write an interval checker that starts when games are loaded:
    let checkLoaded = setInterval(() => {
      if (games.length > 0) {
        clearInterval(checkLoaded);
        
        // Find if game still exists
        const checkGame = games.find(g => g.id === activeTimerId);
        if (!checkGame) {
          localStorage.removeItem('gamevault_active_timer_id');
          localStorage.removeItem('gamevault_active_timer_start');
          activeTimerId = null;
          activeTimerStart = null;
          return;
        }

        renderLibrary();
        
        const timeValEl = document.getElementById(`time-val-${activeTimerId}`);
        const initialTime = checkGame.playtime;

        timerInterval = setInterval(() => {
          if (!activeTimerStart) return;
          const elapsedHrs = (Date.now() - activeTimerStart) / 3600000;
          const totalTime = initialTime + elapsedHrs;
          if (timeValEl) {
            timeValEl.textContent = formatHours(totalTime);
          }
        }, 1000);
      }
    }, 100);
  }
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

  // Populate Filter Platforms Dropdown
  const filterVal = filterPlatform.value;
  filterPlatform.innerHTML = `<option value="All">All Platforms</option>` + 
    combinedPlatforms.map(plat => `<option value="${plat}">${plat}</option>`).join('');
  filterPlatform.value = filterVal; // Restore selected filter platform

  // Populate Modal Game Platform Selector
  const currentSelectVal = gamePlatformSelect.value;
  gamePlatformSelect.innerHTML = `
    <option value="" disabled selected>Select Platform</option>
    ${combinedPlatforms.map(plat => `<option value="${plat}">${plat}</option>`).join('')}
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
        <span>${tag.label}</span>
        <button onclick="removeFilterTag('${tag.key}')"><i data-lucide="x" style="width: 12px; height: 12px;"></i></button>
      </div>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
  } else {
    activeFiltersContainer.style.display = 'none';
  }
}

window.removeFilterTag = function(key) {
  if (key === 'status') {
    activeFilters.status = 'All';
    // Remove selected state on status cards
    document.querySelectorAll('.status-card').forEach(c => c.classList.remove('active-filter'));
  } else if (key === 'platform') {
    activeFilters.platform = 'All';
    filterPlatform.value = 'All';
  } else if (key === 'format') {
    activeFilters.format = 'All';
    filterFormat.value = 'All';
  }
  renderLibrary();
};

// ----------------------------------------------------
// EVENT LISTENERS HANDLER
// ----------------------------------------------------

function setupEventListeners() {
  
  // Search Input query event (with instant rendering)
  searchInput.addEventListener('input', (e) => {
    activeFilters.search = e.target.value.trim();
    if (activeFilters.search.length > 0) {
      searchClearBtn.style.display = 'flex';
    } else {
      searchClearBtn.style.display = 'none';
    }
    renderLibrary();
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

  // Sorting
  sortBySelect.addEventListener('change', (e) => {
    sortBy = e.target.value;
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

  // Status Cards Filter (Clicking dashboard cards)
  document.querySelectorAll('.status-card').forEach(card => {
    card.addEventListener('click', () => {
      const status = card.getAttribute('data-filter-status');
      
      // If already active, toggle it off
      if (activeFilters.status === status) {
        activeFilters.status = 'All';
        card.classList.remove('active-filter');
      } else {
        // Clear active status on others
        document.querySelectorAll('.status-card').forEach(c => c.classList.remove('active-filter'));
        activeFilters.status = status;
        card.classList.add('active-filter');
      }

      showLibraryView();
      renderLibrary();
    });
  });

  // Clear all active filters button
  clearAllFiltersBtn.addEventListener('click', () => {
    activeFilters.status = 'All';
    activeFilters.platform = 'All';
    activeFilters.format = 'All';
    
    // Reset controls
    filterPlatform.value = 'All';
    filterFormat.value = 'All';
    document.querySelectorAll('.status-card').forEach(c => c.classList.remove('active-filter'));
    
    renderLibrary();
  });

  // Add Game Modal opening trigger
  document.getElementById('add-game-btn').addEventListener('click', () => {
    openAddGameModal();
  });
  emptyStateAddBtn.addEventListener('click', () => {
    openAddGameModal();
  });

  // Modal Cancel triggers
  document.getElementById('modal-close-x').addEventListener('click', () => closeModal(gameModal));
  document.getElementById('modal-cancel-btn').addEventListener('click', () => closeModal(gameModal));
  
  // Rating Star Picker clicks inside modal form
  starsContainer.querySelectorAll('i').forEach(star => {
    star.addEventListener('click', (e) => {
      const ratingVal = parseInt(star.getAttribute('data-value'));
      setFormRatingStars(ratingVal);
    });
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
}

// ----------------------------------------------------
// UI NAVIGATION AND VIEW TABS
// ----------------------------------------------------

function showLibraryView() {
  navAll.classList.add('active');
  navStatsTrigger.classList.remove('active');
  
  statsDashboard.style.display = 'grid';
  librarySection.style.display = 'block';
  analysisSection.style.display = 'none';
}

function showAnalysisView() {
  navAll.classList.remove('active');
  navStatsTrigger.classList.add('active');
  
  statsDashboard.style.display = 'none';
  librarySection.style.display = 'none';
  analysisSection.style.display = 'block';
  
  // Re-fetch stats to draw analysis
  fetchStats();
}

function updateViewModeButtons() {
  localStorage.setItem('gamevault_view_mode', viewMode);
  
  if (viewMode === 'list') {
    viewGridBtn.classList.remove('active');
    viewListBtn.classList.add('active');
    document.body.classList.add('list-view-active');
  } else {
    viewGridBtn.classList.add('active');
    viewListBtn.classList.remove('active');
    document.body.classList.remove('list-view-active');
  }
}

// ----------------------------------------------------
// MODAL FORMS HANDLERS
// ----------------------------------------------------

function openModal(modalEl) {
  modalEl.style.display = 'flex';
  setTimeout(() => modalEl.classList.add('show'), 10);
}

function closeModal(modalEl) {
  modalEl.classList.remove('show');
  setTimeout(() => {
    modalEl.style.display = 'none';
  }, 250);
}

function openAddGameModal() {
  modalTitle.textContent = "Add New Game";
  gameForm.reset();
  gameIdInput.value = '';
  customPlatformInput.style.display = 'none';
  customPlatformInput.removeAttribute('required');
  setFormRatingStars(0);
  openModal(gameModal);
}

window.openEditGameModal = function(id) {
  const game = games.find(g => g.id === id);
  if (!game) return;

  modalTitle.textContent = "Edit Game Details";
  gameIdInput.value = game.id;
  document.getElementById('game-title').value = game.title;
  
  // Set platform select option or trigger custom
  const options = Array.from(gamePlatformSelect.options).map(o => o.value);
  if (options.includes(game.platform)) {
    gamePlatformSelect.value = game.platform;
    customPlatformInput.style.display = 'none';
    customPlatformInput.removeAttribute('required');
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
};

function setFormRatingStars(ratingVal) {
  gameRatingInput.value = ratingVal;
  starsContainer.querySelectorAll('i').forEach((star, index) => {
    if (index < ratingVal) {
      star.classList.add('filled');
      star.setAttribute('data-lucide', 'star');
    } else {
      star.classList.remove('filled');
    }
  });
  if (window.lucide) window.lucide.createIcons();
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
  if (!confirm(`Are you absolutely sure? This will OVERWRITE your current database. You will lose any additions or playtime changes not backed up.`)) {
    return;
  }

  // Stop timer if it's active
  if (activeTimerId !== null) {
    stopPlayTimer(false);
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

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${message}</span>
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
