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

// No YouTube JS Player state machine here — every station is a plain
// embed URL, and switching stations is a real navigation to
// pyratedial-app.html?s=<index>. The one exception is a single minimal
// Player object built purely as an unmute bridge (see below), since a
// plain iframe has no way for our own button to talk to it.

const presetStrip = document.getElementById('presetStrip');
const playerSlot = document.getElementById('playerSlot');
const heroFrequencyEl = document.getElementById('heroFrequency');
const heroNameEl = document.getElementById('heroName');
const heroStatusEl = document.getElementById('heroStatus');

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
    mute: '1',
    controls: '0',
    disablekb: '1',
    fs: '0',
    playsinline: '1',
    rel: '0',
    cc_load_policy: '0',
    enablejsapi: '1',
    origin: window.location.origin
  });
  return `https://www.youtube.com/embed/videoseries?${params.toString()}`;
}

// ----- Preset strip -----
function renderPresetLabel(pill, station) {
  pill.innerHTML = `<span class="freq">${formatFrequency(station.frequency)}</span><span class="name"></span>`;
  pill.querySelector('.name').textContent = station.name;
}

function buildPresetStrip(activeIndex) {
  stations.forEach((station, index) => {
    const pill = document.createElement('a');
    pill.className = 'preset-pill';
    pill.dataset.index = String(index);
    // Tapping the already-active preset links back to the bare page
    // (stops); tapping any other preset links to it directly (plays).
    pill.href = index === activeIndex ? 'pyratedial-app.html' : `pyratedial-app.html?s=${index}`;
    renderPresetLabel(pill, station);
    if (index === activeIndex) pill.classList.add('is-active');
    presetStrip.appendChild(pill);
  });
}

function refreshAllPresetLabels() {
  document.querySelectorAll('.preset-pill').forEach(pill => {
    const index = Number(pill.dataset.index);
    const station = stations[index];
    if (station) renderPresetLabel(pill, station);
  });
  const activeIndex = getRequestedIndex();
  if (activeIndex !== null) {
    const active = stations[activeIndex];
    if (active) heroNameEl.textContent = active.name;
  }
}

// ----- The player itself -----
// Minimal use of the YouTube JS API — not for loading or state-tracking
// (the embed URL already does all of that on its own), only so our own
// "TAP FOR SOUND" button has something to call .unMute() on, and so
// shuffle can actually be turned on for the rest of the playlist once
// this one video is underway.
let activePlayer = null;

window.onYouTubeIframeAPIReady = function () {
  window.__pyrateApiReady = true;
};

function loadYouTubeApiScript() {
  if (window.YT?.Player) {
    window.__pyrateApiReady = true;
    return;
  }
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.async = true;
  const firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(tag, firstScript);
}

function attachPlayerBridge(iframe, unmuteButton) {
  function wire() {
    if (!window.YT?.Player) {
      setTimeout(wire, 50);
      return;
    }
    activePlayer = new window.YT.Player(iframe, {
      events: {
        onReady: event => {
          unmuteButton.disabled = false;
          try { event.target.setShuffle(true); } catch (_) {}
        }
      }
    });
  }
  wire();

  unmuteButton.addEventListener('click', () => {
    if (!activePlayer) return;
    try {
      activePlayer.unMute();
      activePlayer.setVolume(100);
    } catch (_) {}
    unmuteButton.remove();
  });
}

function renderPlayer(activeIndex) {
  activePlayer = null;

  if (activeIndex === null) {
    heroFrequencyEl.textContent = '—';
    heroNameEl.textContent = 'SELECT A STATION';
    heroStatusEl.textContent = 'STANDBY';
    playerSlot.innerHTML = '<div class="monitor-standby"><span>STANDBY</span></div>';
    return;
  }

  const station = stations[activeIndex];
  heroFrequencyEl.textContent = formatFrequency(station.frequency);
  heroNameEl.textContent = station.name;
  heroStatusEl.textContent = 'SIGNAL LOCK';

  const iframe = document.createElement('iframe');
  iframe.className = 'youtube-player';
  iframe.src = buildEmbedUrl(station);
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('aria-label', 'YouTube station video player');

  const unmuteButton = document.createElement('button');
  unmuteButton.type = 'button';
  unmuteButton.className = 'unmute-button';
  unmuteButton.textContent = 'TAP FOR SOUND';
  unmuteButton.disabled = true;

  playerSlot.innerHTML = '';
  playerSlot.appendChild(iframe);
  playerSlot.appendChild(unmuteButton);

  loadYouTubeApiScript();
  attachPlayerBridge(iframe, unmuteButton);
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
    refreshAllPresetLabels();
  }
  localStorage.setItem(`${OEMBED_CACHE_KEY}.updated`, String(Date.now()));
}

// ----- Init -----
loadCachedStationMetadata();
const activeIndex = getRequestedIndex();
buildPresetStrip(activeIndex);
renderPlayer(activeIndex);
refreshStationMetadata(true);

// Scroll the active preset into view, centered, so the strip opens right
// where you are instead of at the far left every time.
if (activeIndex !== null) {
  const activePill = presetStrip.querySelector('.preset-pill.is-active');
  if (activePill) activePill.scrollIntoView({ inline: 'center', block: 'nearest' });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshStationMetadata();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./pyratedial-app-sw.js').catch(() => {}));
}
