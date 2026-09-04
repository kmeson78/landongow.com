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

let apiReady = false;

// Two explicit slots instead of one. ytPlayer is the CONFIRMED, audible
// player (or null). pendingPlayer is whatever's currently loading and NOT
// yet confirmed (or null). The intermittent "plays but no video" bug came
// from only ever tracking the last CONFIRMED player: if a new tap fired
// before the previous one confirmed, that previous, still-loading iframe
// was never destroyed by anyone — it just sat in the DOM, silent, ahead of
// whatever was actually playing, blocking it from view. Every new tap now
// destroys BOTH slots unconditionally before creating anything, so nothing
// can ever accumulate.
let ytPlayer = null;
let pendingPlayer = null;
let tuneToken = 0;
let tuneInFlight = false;
let activeIndex = null;

const monitorBay = document.getElementById('monitorBay');
const monitorStandby = document.getElementById('monitorStandby');
const monitorScreen = document.querySelector('.monitor-screen');
const gridTop = document.getElementById('stationGridTop');
const gridBottom = document.getElementById('stationGridBottom');
const playerFrequencyEl = document.getElementById('playerFrequency');
const playerNameEl = document.getElementById('playerName');
const playerStatusEl = document.getElementById('playerStatus');

const formatFrequency = freq => Number(freq).toFixed(1);

function destroyPlayer(player) {
  if (!player) return;
  try { player.destroy(); } catch (_) {}
}

function setStatus(text) {
  playerStatusEl.textContent = text;
}

function setMonitorMessage(message) {
  if (monitorBay) monitorBay.classList.remove('player-ready');
  if (!monitorStandby) return;
  monitorStandby.innerHTML = `<span>${message}</span>`;
  monitorStandby.style.display = 'grid';
}

function revealPlayer() {
  if (monitorBay) monitorBay.classList.add('player-ready');
  if (monitorStandby) monitorStandby.style.display = 'none';
}

function setIframePermissions(player) {
  try {
    const iframe = player.getIframe();
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  } catch (_) {}
}

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

// ----- Station buttons -----
function updateActiveButtonStyling() {
  document.querySelectorAll('.station-button').forEach(btn => {
    btn.classList.toggle('is-active', Number(btn.dataset.index) === activeIndex);
  });
}

function setButtonsBusy(busy) {
  document.querySelectorAll('.station-button').forEach(btn => { btn.disabled = busy; });
}

function renderButtonLabel(button, station) {
  button.innerHTML = `<span class="freq">${formatFrequency(station.frequency)}</span><span class="name"></span>`;
  button.querySelector('.name').textContent = station.name;
}

function buildStationButtons() {
  stations.forEach((station, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'station-button';
    button.dataset.index = String(index);
    renderButtonLabel(button, station);
    button.addEventListener('click', () => handleStationTap(index));
    (index < 10 ? gridTop : gridBottom).appendChild(button);
  });
}

function refreshAllButtonLabels() {
  document.querySelectorAll('.station-button').forEach(button => {
    const index = Number(button.dataset.index);
    const station = stations[index];
    if (station) renderButtonLabel(button, station);
  });
  if (activeIndex !== null) {
    const active = stations[activeIndex];
    if (active) playerNameEl.textContent = active.name;
  }
}

// ----- Playback -----
// Tapping the currently-active station again stops it; tapping any other
// station loads and plays it, replacing whatever was playing.
function handleStationTap(targetIndex) {
  if (activeIndex === targetIndex && !tuneInFlight) {
    stopPlayback();
    return;
  }
  playStation(targetIndex);
}

// Called directly from a station-button tap, so construction/commands
// happen inside the user's gesture on iPhone.
function playStation(targetIndex) {
  const station = stations[targetIndex];
  if (!station?.playlistId) return;
  if (!ytPlayer && !pendingPlayer && !apiReady) {
    setStatus('WARMING UP');
    return;
  }

  const token = ++tuneToken;

  // Unconditional cleanup of BOTH slots before anything new starts. This
  // is what guarantees no orphaned iframe can ever accumulate, regardless
  // of whether the previous tap ever confirmed.
  destroyPlayer(pendingPlayer);
  pendingPlayer = null;
  const outgoingPlayer = ytPlayer;
  ytPlayer = null;

  activeIndex = targetIndex;
  tuneInFlight = true;
  updateActiveButtonStyling();
  setButtonsBusy(true);
  setMonitorMessage('TUNING');
  setStatus('TUNING');
  playerFrequencyEl.textContent = formatFrequency(station.frequency);
  playerNameEl.textContent = station.name;

  if (outgoingPlayer) {
    try { outgoingPlayer.mute(); } catch (_) {}
  }

  const startIndex = chooseRandomIndex(station);

  // Only relevant for the very first tap ever: clears the static
  // placeholder div so it doesn't sit ahead of every real player.
  document.getElementById('youtubePlayer')?.remove();

  const container = document.createElement('div');
  container.className = 'youtube-player';
  container.setAttribute('aria-label', 'YouTube station video player');
  monitorScreen.insertBefore(container, monitorStandby);

  function abandonTune(failedPlayer) {
    if (token !== tuneToken) return;
    tuneInFlight = false;
    activeIndex = null;
    updateActiveButtonStyling();
    setButtonsBusy(false);
    destroyPlayer(failedPlayer);
    if (pendingPlayer === failedPlayer) pendingPlayer = null;
    destroyPlayer(outgoingPlayer);
    setStatus('SIGNAL HOLD');
  }

  pendingPlayer = new YT.Player(container, {
    width: '200',
    height: '200',
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      playsinline: 1,
      rel: 0,
      cc_load_policy: 0,
      origin: window.location.origin
    },
    events: {
      onReady: event => {
        if (token !== tuneToken) return;
        setIframePermissions(event.target);
        try {
          event.target.mute();
          event.target.setVolume(100);
          event.target.loadPlaylist({
            listType: 'playlist',
            list: station.playlistId,
            index: startIndex,
            startSeconds: 0
          });
        } catch (error) {
          console.warn('Pyrate Dial station load failed:', error);
          abandonTune(event.target);
        }
      },
      onStateChange: event => {
        if (token !== tuneToken) return;

        if (event.data === YT.PlayerState.PLAYING) {
          destroyPlayer(outgoingPlayer);
          ytPlayer = event.target;
          pendingPlayer = null;

          revealPlayer();
          try {
            event.target.unMute();
            event.target.setVolume(100);
            event.target.setShuffle(true);
          } catch (_) {}

          tuneInFlight = false;
          setButtonsBusy(false);
          setStatus('SIGNAL LOCK');
        } else if (event.data === YT.PlayerState.BUFFERING) {
          setStatus('TUNING');
        } else if (event.data === YT.PlayerState.ENDED) {
          if (!tuneInFlight) {
            try {
              event.target.nextVideo();
              event.target.playVideo();
            } catch (_) {}
          }
        }
      },
      onAutoplayBlocked: event => {
        if (token !== tuneToken) return;
        setStatus('TAP AGAIN');
        abandonTune(event?.target);
      },
      onError: event => {
        if (token !== tuneToken) return;
        if ([100, 101, 150].includes(event.data)) {
          setStatus('AUTO SKIP');
          try {
            event.target.nextVideo();
            event.target.playVideo();
          } catch (_) {}
          return;
        }
        abandonTune(event.target);
      }
    }
  });
}

function stopPlayback() {
  tuneToken++; // invalidate anything still in flight
  tuneInFlight = false;
  activeIndex = null;
  updateActiveButtonStyling();
  setButtonsBusy(false);
  destroyPlayer(pendingPlayer);
  pendingPlayer = null;
  destroyPlayer(ytPlayer);
  ytPlayer = null;
  setMonitorMessage('STANDBY');
  setStatus('STANDBY');
  playerFrequencyEl.textContent = '—';
  playerNameEl.textContent = 'SELECT A STATION';
}

// ----- Official YouTube IFrame Player API -----
window.onYouTubeIframeAPIReady = function () {
  apiReady = true;
};

(function loadYouTubeApi() {
  if (window.YT?.Player) {
    apiReady = true;
    return;
  }
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.async = true;
  const firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(tag, firstScript);
})();

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
buildStationButtons();
refreshStationMetadata(true);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshStationMetadata();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./pyratedial-app-sw.js').catch(() => {}));
}
