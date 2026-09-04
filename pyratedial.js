const FM_MIN = 88.1;
const FM_MAX = 107.9;
const FM_STEP = 0.2;
const CONFIG = window.PYRATE_DIAL_CONFIG || {};

// These are only a fallback for offline/prototype use. When a YouTube API key
// is configured, the live public playlist list replaces them automatically.
const FALLBACK_STATIONS = [
  { frequency: 88.3, name: "Wilt Josey" },
  { frequency: 89.1, name: "Poet Row" },
  { frequency: 90.7, name: "Basement Tapes" },
  { frequency: 91.1, name: "Little Red Songbook" },
  { frequency: 93.9, name: "Atomic Hits", playlistId: "PLtJfKjV02nK7H_fNgiYZSwF8wAilPBOcC" },
  { frequency: 95.7, name: "Jeffrey's Corner" },
  { frequency: 98.3, name: "Tivel Hour" },
  { frequency: 99.9, name: "Sleepy Mountain" },
  { frequency: 100.7, name: "Joshua's Barstool" },
  { frequency: 101.5, name: "Sentimental Hits" },
  { frequency: 102.3, name: "Bird Song" },
  { frequency: 103.1, name: "H.C. Catalog" },
  { frequency: 104.9, name: "Helles Welles" },
  { frequency: 105.7, name: "Jurado Way" },
  { frequency: 107.9, name: "Ultimate Endless" }
];

let stations = [...FALLBACK_STATIONS].sort((a, b) => a.frequency - b.frequency);
let currentIndex = 0;
let seekTimer = null;
let deferredInstallPrompt = null;
let refreshTimer = null;
let lastSyncAt = 0;
let syncInFlight = null;

const receiver = document.querySelector('.receiver');
const frequencyEl = document.getElementById('frequency');
const stationNameEl = document.getElementById('stationName');
const markerEl = document.getElementById('signalMarker');
const statusEl = document.getElementById('status');
const prevButton = document.getElementById('prevStation');
const nextButton = document.getElementById('nextStation');
const installButton = document.getElementById('installButton');
const installPanel = document.getElementById('installPanel');
const installDialog = document.getElementById('installDialog');
const installInstructions = document.getElementById('installInstructions');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const markerPosition = freq => ((freq - FM_MIN) / (FM_MAX - FM_MIN)) * 100;
const formatFrequency = freq => Number(freq).toFixed(1);
const configuredApiKey = () => {
  const key = String(CONFIG.youtubeApiKey || '').trim();
  return key && key !== 'PASTE_YOUR_NEW_API_KEY_HERE' ? key : null;
};

function isValidUSFMFrequency(freq) {
  const tenths = Math.round(freq * 10);
  return freq >= FM_MIN && freq <= FM_MAX && tenths % 2 === 1;
}

function parseStationTitle(title, playlistId) {
  // Official naming format: 93.9 — Atomic Hits
  // Hyphen/en-dash/colon are tolerated so one typo does not kill a station.
  const match = String(title || '').trim().match(/^(\d{2,3}\.\d)\s*(?:—|–|-|:)\s*(.+?)\s*$/u);
  if (!match) return null;
  const frequency = Number(match[1]);
  const name = match[2].trim();
  if (!name || !Number.isFinite(frequency) || !isValidUSFMFrequency(frequency)) return null;
  return { frequency, name, playlistId };
}

function normalizeStations(items) {
  const byFrequency = new Map();
  for (const item of items) {
    const station = parseStationTitle(item?.snippet?.title, item?.id);
    if (!station) continue;
    // First playlist at a frequency wins; duplicates are ignored quietly.
    if (!byFrequency.has(station.frequency)) byFrequency.set(station.frequency, station);
  }
  return [...byFrequency.values()].sort((a, b) => a.frequency - b.frequency);
}

function restoreCurrentIndex(previousFrequency) {
  const remembered = Number.isFinite(previousFrequency)
    ? previousFrequency
    : Number(localStorage.getItem('pyrateDial.lastFrequency'));
  let index = stations.findIndex(s => s.frequency === remembered);
  if (index < 0) index = stations.findIndex(s => s.frequency === 93.9);
  if (index < 0) index = 0;
  currentIndex = index;
}

function updateButtons() {
  prevButton.disabled = currentIndex <= 0 || stations.length < 2;
  nextButton.disabled = currentIndex >= stations.length - 1 || stations.length < 2;
}

function renderStation(station, status = 'SIGNAL LOCK') {
  if (!station) return;
  frequencyEl.textContent = formatFrequency(station.frequency);
  stationNameEl.textContent = station.name;
  markerEl.style.left = `${clamp(markerPosition(station.frequency), 0, 100)}%`;
  statusEl.textContent = status;
  localStorage.setItem('pyrateDial.lastFrequency', String(station.frequency));
  document.title = `${formatFrequency(station.frequency)} — ${station.name} · Pyrate Dial`;
  updateButtons();
}

function scanTo(targetIndex) {
  if (targetIndex < 0 || targetIndex >= stations.length || targetIndex === currentIndex) return;

  clearInterval(seekTimer);
  receiver.classList.add('seeking');
  statusEl.textContent = 'AUTO SEEK';
  prevButton.disabled = true;
  nextButton.disabled = true;
  stationNameEl.textContent = '—';

  const startFrequency = stations[currentIndex].frequency;
  const targetFrequency = stations[targetIndex].frequency;
  const direction = targetFrequency > startFrequency ? 1 : -1;
  let displayed = startFrequency;

  seekTimer = setInterval(() => {
    displayed = Number((displayed + FM_STEP * direction).toFixed(1));
    const reached = direction > 0 ? displayed >= targetFrequency : displayed <= targetFrequency;

    if (reached) {
      clearInterval(seekTimer);
      currentIndex = targetIndex;
      renderStation(stations[currentIndex]);
      receiver.classList.remove('seeking');
      return;
    }

    frequencyEl.textContent = formatFrequency(displayed);
    markerEl.style.left = `${clamp(markerPosition(displayed), 0, 100)}%`;
  }, 29);
}

async function youtubeJson(path, params) {
  const key = configuredApiKey();
  if (!key) throw new Error('API key not configured');
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries({ ...params, key }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
    throw new Error(detail || `YouTube request failed (${response.status})`);
  }
  return response.json();
}

async function resolveChannelId() {
  const cacheKey = `pyrateDial.channelId.${CONFIG.youtubeHandle || '@landon78'}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  const result = await youtubeJson('channels', {
    part: 'id',
    forHandle: CONFIG.youtubeHandle || '@landon78',
    maxResults: '1'
  });
  const id = result?.items?.[0]?.id;
  if (!id) throw new Error('YouTube channel not found');
  localStorage.setItem(cacheKey, id);
  return id;
}

async function fetchAllPublicPlaylists(channelId) {
  const items = [];
  let pageToken = '';
  do {
    const params = {
      part: 'snippet',
      channelId,
      maxResults: '50'
    };
    if (pageToken) params.pageToken = pageToken;
    const result = await youtubeJson('playlists', params);
    items.push(...(result.items || []));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return items;
}

async function syncStations({ force = false } = {}) {
  const key = configuredApiKey();
  if (!key) {
    statusEl.textContent = 'LOCAL INDEX';
    return false;
  }

  const now = Date.now();
  if (!force && now - lastSyncAt < 30000) return false;
  if (syncInFlight) return syncInFlight;

  const previousFrequency = stations[currentIndex]?.frequency;
  syncInFlight = (async () => {
    try {
      statusEl.textContent = 'SYNC';
      const channelId = await resolveChannelId();
      const playlists = await fetchAllPublicPlaylists(channelId);
      const liveStations = normalizeStations(playlists);
      if (!liveStations.length) throw new Error('No matching station playlists found');
      stations = liveStations;
      restoreCurrentIndex(previousFrequency);
      renderStation(stations[currentIndex], 'SIGNAL LOCK');
      lastSyncAt = Date.now();
      localStorage.setItem('pyrateDial.lastStationSync', String(lastSyncAt));
      return true;
    } catch (error) {
      console.warn('Pyrate Dial station sync failed:', error);
      // Keep the last known/fallback station index working if YouTube is unreachable.
      renderStation(stations[currentIndex], 'INDEX HOLD');
      return false;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

prevButton.addEventListener('click', () => scanTo(currentIndex - 1));
nextButton.addEventListener('click', () => scanTo(currentIndex + 1));

window.addEventListener('focus', () => syncStations({ force: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncStations({ force: true });
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  if (installPanel) installPanel.hidden = true;
});

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

installButton?.addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return;
  }

  if (isIOS()) {
    installInstructions.innerHTML = `
      <p>On iPhone:</p>
      <ol>
        <li>Open Pyrate Dial in Safari.</li>
        <li>Tap the Share button.</li>
        <li>Choose “Add to Home Screen.”</li>
        <li>Tap “Add.”</li>
      </ol>
      <p class="dialog-note">The Home Screen version opens directly as a standalone receiver.</p>
    `;
  } else {
    installInstructions.innerHTML = `
      <p>Use your browser’s “Install app” or “Add to Home Screen” command to install Pyrate Dial on this device.</p>
      <p class="dialog-note">Once installed, Pyrate Dial opens as a standalone receiver.</p>
    `;
  }

  installDialog?.showModal();
});

if (isStandalone() && installPanel) installPanel.hidden = true;

restoreCurrentIndex();
renderStation(stations[currentIndex], configuredApiKey() ? 'SYNC' : 'LOCAL INDEX');
syncStations({ force: true });
refreshTimer = setInterval(() => syncStations(), Math.max(60000, Number(CONFIG.refreshMs) || 120000));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./pyratedial-sw.js', { scope: './pyratedial.html' }).catch(() => {}));
}
