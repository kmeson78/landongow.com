// Fixed station map — identical to the dial page. Playlist IDs are stable;
// YouTube remains the live source of every station's actual contents.
const STATIONS = [
  { frequency: 88.3, name: "Wilt Josey", playlistId: "PLtJfKjV02nK5zvGMYE_m1PTvX2v1ykTTm", videoCount: 120 },
  { frequency: 89.1, name: "Poet Row", playlistId: "PLf4jefl9i4GE", videoCount: 221 },
  { frequency: 90.7, name: "Basement Tapes", playlistId: "PLtJfKjV02nK47AU54zBeTv3Xq-RmmW_E3", videoCount: 200 },
  { frequency: 91.1, name: "Little Red Songbook", playlistId: "PLCcf-gNtNssc", videoCount: 33 },
  { frequency: 91.7, name: "Test Pattern", playlistId: "PLEZbyDYLyoeg", videoCount: 1 },
  { frequency: 92.5, name: "The Epidemic", playlistId: "PLPPUTf_kY4p4", videoCount: 17 },
  { frequency: 93.9, name: "Atomic Hits", playlistId: "PLtJfKjV02nK7H_fNgiYZSwF8wAilPBOcC", videoCount: 46 },
  { frequency: 94.7, name: "Standby Signal", playlistId: "PLQUHC3DmiKi8", videoCount: 1 },
  { frequency: 95.7, name: "Martin's Corner", playlistId: "PLtJfKjV02nK5zLBM_-OF4FH46GGVtEYz-", videoCount: 53 },
  { frequency: 96.9, name: "Dead Air", playlistId: "PLOG7V5TNJmjI", videoCount: 1 },
  { frequency: 98.3, name: "Tivel Hour", playlistId: "PLtJfKjV02nK6PLkS4mVlWNOiD-q2tIUxe", videoCount: 72 },
  { frequency: 99.9, name: "Sleepy Mountain", playlistId: "PLtJfKjV02nK5iUqUFnSQvqucBBfg93twL", videoCount: 27 },
  { frequency: 100.7, name: "Joshua's Barstool", playlistId: "PLtJfKjV02nK6_nR9NkG1JuiRPWP_IANjY", videoCount: 71 },
  { frequency: 101.5, name: "Sentimental Hits", playlistId: "PLtJfKjV02nK70xTDAe9HERw9vdoFS4sjf", videoCount: 31 },
  { frequency: 102.3, name: "Bird Song", playlistId: "PLtJfKjV02nK4esMJ3uDBL5Zy2-mCEykui", videoCount: 121 },
  { frequency: 103.1, name: "H.C. Catalog", playlistId: "PLtJfKjV02nK7uOl7VZ7EwpLk9pfBXOw6P", videoCount: 27 },
  { frequency: 104.9, name: "Helles Welles", playlistId: "PLtJfKjV02nK7ZhssFluZx_bsEAya0DqtP", videoCount: 108 },
  { frequency: 105.7, name: "Jurado Way", playlistId: "PLtJfKjV02nK4m5iHY8-6wOGed8wb3pxGe", videoCount: 231 },
  { frequency: 106.9, name: "Calibration", playlistId: "PLTsu7Jw8TppY", videoCount: 1 },
  { frequency: 107.9, name: "Ultimate Endless", playlistId: "PLtJfKjV02nK7EiGIkgk8QYFhA1wZRAlSc", videoCount: 273 }
].sort((a, b) => a.frequency - b.frequency);

const stations = STATIONS;

// No YouTube JS Player API anywhere in this file. Every station is a plain
// <iframe src="https://www.youtube.com/embed/videoseries?..."> — the same
// kind of embed YouTube itself gives you to paste into any web page. There
// is no player object, no state-change events, no confirmation logic, and
// nothing to keep in sync across multiple in-page loads, because there are
// no in-page loads: switching stations is a real navigation to
// pyratedial-app.html?s=<index>, and the iframe is written once, as a
// direct part of loading that page — not constructed later in response to
// something happening on an already-loaded page. That's what removes the
// entire class of bugs this project hit tonight: there's no shared,
// evolving JS state left for two overlapping actions to race over.

const gridTop = document.getElementById('stationGridTop');
const gridBottom = document.getElementById('stationGridBottom');
const playerSlot = document.getElementById('playerSlot');
const playerFrequencyEl = document.getElementById('playerFrequency');
const playerNameEl = document.getElementById('playerName');
const playerStatusEl = document.getElementById('playerStatus');

const formatFrequency = freq => Number(freq).toFixed(1);

// ----- Random starting position (identical logic to the dial page) -----
function recentIndexKey(playlistId) {
  return `pyrateDialApp.recentStartIndices.${playlistId}`;
}

function getRecentIndices(playlistId) {
  try {
    const value = JSON.parse(localStorage.getItem(recentIndexKey(playlistId)) || '[]');
    return Array.isArray(value) ? value.filter(Number.isInteger) : [];
  } catch (_) {
    return [];
  }
}

function chooseRandomIndex(station) {
  const count = Math.max(1, Number(station.videoCount) || 1);
  if (count === 1) return 0;

  const recent = new Set(getRecentIndices(station.playlistId));
  let candidates = Array.from({ length: count }, (_, i) => i).filter(i => !recent.has(i));
  if (!candidates.length) candidates = Array.from({ length: count }, (_, i) => i);

  const index = candidates[Math.floor(Math.random() * candidates.length)];
  const nextRecent = [index, ...getRecentIndices(station.playlistId).filter(i => i !== index)].slice(0, Math.min(8, count - 1));
  localStorage.setItem(recentIndexKey(station.playlistId), JSON.stringify(nextRecent));
  return index;
}

// ----- Which station this page load is for -----
function getRequestedIndex() {
  const params = new URLSearchParams(location.search);
  if (!params.has('s')) return null;
  const n = Number(params.get('s'));
  return Number.isInteger(n) && n >= 0 && n < stations.length ? n : null;
}

function buildEmbedUrl(station) {
  const startIndex = chooseRandomIndex(station);
  const params = new URLSearchParams({
    list: station.playlistId,
    index: String(startIndex),
    autoplay: '1',
    playsinline: '1',
    rel: '0',
    cc_load_policy: '0',
    origin: window.location.origin
  });
  return `https://www.youtube.com/embed/videoseries?${params.toString()}`;
}

// ----- Station buttons — real links, not click handlers -----
function renderButtonLabel(link, station) {
  link.innerHTML = `<span class="freq">${formatFrequency(station.frequency)}</span><span class="name"></span>`;
  link.querySelector('.name').textContent = station.name;
}

function buildStationButtons(activeIndex) {
  stations.forEach((station, index) => {
    const link = document.createElement('a');
    link.className = 'station-button';
    link.dataset.index = String(index);
    // Tapping the already-active station links back to the bare page
    // (stops); tapping any other station links to it directly (plays).
    link.href = index === activeIndex ? 'pyratedial-app.html' : `pyratedial-app.html?s=${index}`;
    renderButtonLabel(link, station);
    if (index === activeIndex) link.classList.add('is-active');
    (index < 10 ? gridTop : gridBottom).appendChild(link);
  });
}

function refreshAllButtonLabels() {
  document.querySelectorAll('.station-button').forEach(link => {
    const index = Number(link.dataset.index);
    const station = stations[index];
    if (station) renderButtonLabel(link, station);
  });
  const activeIndex = getRequestedIndex();
  if (activeIndex !== null) {
    const active = stations[activeIndex];
    if (active) playerNameEl.textContent = active.name;
  }
}

// ----- The player itself -----
function renderPlayer(activeIndex) {
  if (activeIndex === null) {
    playerFrequencyEl.textContent = '—';
    playerNameEl.textContent = 'SELECT A STATION';
    playerStatusEl.textContent = 'STANDBY';
    playerSlot.innerHTML = '<div class="monitor-standby"><span>STANDBY</span></div>';
    return;
  }

  const station = stations[activeIndex];
  playerFrequencyEl.textContent = formatFrequency(station.frequency);
  playerNameEl.textContent = station.name;
  playerStatusEl.textContent = 'SIGNAL LOCK';

  const iframe = document.createElement('iframe');
  iframe.className = 'youtube-player';
  iframe.src = buildEmbedUrl(station);
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('aria-label', 'YouTube station video player');
  playerSlot.innerHTML = '';
  playerSlot.appendChild(iframe);
}

// ----- Station title refresh (public, no API key — same as the dial page) -----
const OEMBED_REFRESH_MS = 30 * 60 * 1000;
const OEMBED_CACHE_KEY = 'pyrateDial.stationMetadata';

function parseStationTitle(title, expectedFrequency) {
  if (typeof title !== 'string') return null;
  const match = title.trim().match(/^(\d{2,3}\.\d)\s*(?:—|–|-)\s*(.+)$/);
  if (!match) return null;
  const frequency = Number(match[1]);
  const name = match[2].trim();
  if (!name || Math.abs(frequency - expectedFrequency) > 0.001) return null;
  return { name };
}

function loadCachedStationMetadata() {
  try {
    const cached = JSON.parse(localStorage.getItem(OEMBED_CACHE_KEY) || '{}');
    if (!cached || typeof cached !== 'object') return;
    for (const station of stations) {
      const entry = cached[station.playlistId];
      if (entry?.name) station.name = entry.name;
    }
  } catch (_) {}
}

async function refreshStationMetadata(force = false) {
  const last = Number(localStorage.getItem(`${OEMBED_CACHE_KEY}.updated`) || 0);
  if (!force && Date.now() - last < OEMBED_REFRESH_MS) return;

  const updates = {};
  await Promise.all(stations.map(async station => {
    try {
      const playlistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(station.playlistId)}`;
      const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(playlistUrl)}`;
      const response = await fetch(oembedUrl, { mode: 'cors', cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const parsed = parseStationTitle(data.title, station.frequency);
      if (!parsed) return;
      station.name = parsed.name;
      updates[station.playlistId] = { name: parsed.name };
    } catch (_) {}
  }));

  if (Object.keys(updates).length) {
    let previous = {};
    try { previous = JSON.parse(localStorage.getItem(OEMBED_CACHE_KEY) || '{}') || {}; } catch (_) {}
    localStorage.setItem(OEMBED_CACHE_KEY, JSON.stringify({ ...previous, ...updates }));
    refreshAllButtonLabels();
  }
  localStorage.setItem(`${OEMBED_CACHE_KEY}.updated`, String(Date.now()));
}

// ----- Init -----
loadCachedStationMetadata();
const activeIndex = getRequestedIndex();
buildStationButtons(activeIndex);
renderPlayer(activeIndex);
refreshStationMetadata(true);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshStationMetadata();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./pyratedial-app-sw.js').catch(() => {}));
}
