const FM_MIN = 88.1;
const FM_MAX = 107.9;
const FM_STEP = 0.2;
const TUNE_ANIMATION_MS = 300;

// Fixed station map. The playlist IDs are stable; YouTube remains the live
// source of every station's actual playlist contents.
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

let stations = STATIONS;
let currentIndex = 0;

let apiReady = false;

let ytPlayer = null;
let tuneToken = 0;
let powered = false;
let requestedStation = null;

let animating = false;
let tuneInFlight = false;
let pendingIndex = null;

const receiver = document.querySelector('.receiver');
const monitorBay = document.querySelector('.monitor-bay');
const monitorScreen = document.querySelector('.monitor-screen');
const monitorStandby = document.getElementById('monitorStandby');
const frequencyEl = document.getElementById('frequency');
const stationNameEl = document.getElementById('stationName');
const markerEl = document.getElementById('signalMarker');
const statusEl = document.getElementById('status');
const prevButton = document.getElementById('prevStation');
const nextButton = document.getElementById('nextStation');
const powerButton = document.getElementById('powerButton');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const markerPosition = freq => ((freq - FM_MIN) / (FM_MAX - FM_MIN)) * 100;
const formatFrequency = freq => Number(freq).toFixed(1);

// ----- Station title refresh (public, no API key) -----
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
  }
  localStorage.setItem(`${OEMBED_CACHE_KEY}.updated`, String(Date.now()));
  if (!animating && !tuneInFlight) renderStation(stations[currentIndex]);
}

// ----- Dial UI -----
function restoreCurrentIndex() {
  const remembered = Number(localStorage.getItem('pyrateDial.lastFrequency'));
  let index = stations.findIndex(s => s.frequency === remembered);
  if (index < 0) index = stations.findIndex(s => s.frequency === 93.9);
  if (index < 0) index = 0;
  currentIndex = index;
}

function syncControlAvailability() {
  const busy = animating || tuneInFlight;
  prevButton.disabled = busy || currentIndex <= 0 || stations.length < 2;
  nextButton.disabled = busy || currentIndex >= stations.length - 1 || stations.length < 2;
  powerButton.disabled = busy;
}

function renderStation(station, status = null) {
  if (!station) return;
  frequencyEl.textContent = formatFrequency(station.frequency);
  stationNameEl.textContent = station.name;
  markerEl.style.left = `${clamp(markerPosition(station.frequency), 0, 100)}%`;
  if (status) statusEl.textContent = status;
  localStorage.setItem('pyrateDial.lastFrequency', String(station.frequency));
  document.title = `${formatFrequency(station.frequency)} — ${station.name} · Pyrate Dial`;
  syncControlAvailability();
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

// ----- Random starting position -----
function recentIndexKey(playlistId) {
  return `pyrateDial.recentStartIndices.${playlistId}`;
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

// ----- Playback -----
function setIframePermissions(player) {
  try {
    const iframe = player.getIframe();
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  } catch (_) {}
}

function updatePowerControl() {
  if (!powerButton) return;
  powerButton.classList.toggle('is-on', powered);
  powerButton.setAttribute('aria-pressed', powered ? 'true' : 'false');
}

function animateFrequencySweep(fromFreq, toFreq, onDone) {
  animating = true;
  syncControlAvailability();
  const startTime = performance.now();

  function step(now) {
    const t = Math.min(1, (now - startTime) / TUNE_ANIMATION_MS);
    const current = fromFreq + (toFreq - fromFreq) * t;
    frequencyEl.textContent = formatFrequency(Math.round(current / FM_STEP) * FM_STEP);
    markerEl.style.left = `${clamp(markerPosition(current), 0, 100)}%`;

    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }

    frequencyEl.textContent = formatFrequency(toFreq);
    markerEl.style.left = `${clamp(markerPosition(toFreq), 0, 100)}%`;
    animating = false;
    syncControlAvailability();
    if (onDone) onDone();
  }

  requestAnimationFrame(step);
}

function spinUpPlayer(station, targetIndex) {
  if (!apiReady || !station?.playlistId) return;

  const token = ++tuneToken;
  const outgoingPlayer = ytPlayer;
  pendingIndex = targetIndex;
  requestedStation = station;
  tuneInFlight = true;
  syncControlAvailability();
  setMonitorMessage('TUNING');
  statusEl.textContent = 'TUNING';

  if (outgoingPlayer) {
    try { outgoingPlayer.mute(); } catch (_) {}
  }

  const startIndex = chooseRandomIndex(station);

  document.getElementById('youtubePlayer')?.remove();

  const container = document.createElement('div');
  container.className = 'youtube-player';
  container.setAttribute('aria-label', 'YouTube station video player');
  monitorScreen.insertBefore(container, monitorStandby);

  function abandonTune(failedPlayer) {
    if (token !== tuneToken) return;
    tuneInFlight = false;
    pendingIndex = null;
    try { failedPlayer?.destroy(); } catch (_) {}
    if (outgoingPlayer) { try { outgoingPlayer.destroy(); } catch (_) {} }
    if (ytPlayer === outgoingPlayer) ytPlayer = null;
    syncControlAvailability();
  }

  new YT.Player(container, {
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
          statusEl.textContent = 'SIGNAL HOLD';
          abandonTune(event.target);
        }
      },
      onStateChange: event => {
        if (token !== tuneToken || !powered) return;

        if (event.data === YT.PlayerState.PLAYING) {
          if (outgoingPlayer) {
            try { outgoingPlayer.destroy(); } catch (_) {}
          }
          ytPlayer = event.target;

          revealPlayer();
          try {
            event.target.unMute();
            event.target.setVolume(100);
            event.target.setShuffle(true);
          } catch (_) {}

          if (tuneInFlight) {
            tuneInFlight = false;
            if (pendingIndex !== null) {
              currentIndex = pendingIndex;
              pendingIndex = null;
            }
            renderStation(requestedStation, 'SIGNAL LOCK');
          } else {
            statusEl.textContent = 'SIGNAL LOCK';
          }
        } else if (event.data === YT.PlayerState.BUFFERING) {
          statusEl.textContent = 'TUNING';
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
        statusEl.textContent = powered ? 'TUNE AGAIN' : 'POWER OFF';
        abandonTune(event?.target);
      },
      onError: event => {
        if (token !== tuneToken) return;
        if ([100, 101, 150].includes(event.data)) {
          statusEl.textContent = 'AUTO SKIP';
          try {
            event.target.nextVideo();
            event.target.playVideo();
          } catch (_) {}
          return;
        }
        statusEl.textContent = 'SIGNAL HOLD';
        if (tuneInFlight) abandonTune(event.target);
      }
    }
  });
}

function powerOnReceiver() {
  if (!apiReady) {
    statusEl.textContent = 'WARMING UP';
    return;
  }
  if (tuneInFlight || animating) return;

  powered = true;
  updatePowerControl();
  spinUpPlayer(stations[currentIndex], currentIndex);
}

function powerOffReceiver() {
  powered = false;
  requestedStation = null;
  pendingIndex = null;
  tuneInFlight = false;
  tuneToken++;
  updatePowerControl();
  if (ytPlayer) {
    try { ytPlayer.destroy(); } catch (_) {}
    ytPlayer = null;
  }
  setMonitorMessage('POWER OFF');
  statusEl.textContent = 'POWER OFF';
  syncControlAvailability();
}

function togglePower() {
  if (powered) powerOffReceiver();
  else powerOnReceiver();
}

function scanTo(targetIndex) {
  if (targetIndex < 0 || targetIndex >= stations.length || targetIndex === currentIndex) return;
  if (tuneInFlight || animating) return;

  const startFrequency = stations[currentIndex].frequency;
  const targetStation = stations[targetIndex];

  receiver.classList.add('seeking');
  stationNameEl.textContent = '—';
  statusEl.textContent = 'AUTO SEEK';

  if (powered) {
    spinUpPlayer(targetStation, targetIndex);
  } else {
    currentIndex = targetIndex;
  }

  animateFrequencySweep(startFrequency, targetStation.frequency, () => {
    receiver.classList.remove('seeking');
    if (!powered) {
      renderStation(targetStation, 'POWER OFF');
    }
  });
}

powerButton?.addEventListener('click', togglePower);
prevButton.addEventListener('click', () => scanTo(currentIndex - 1));
nextButton.addEventListener('click', () => scanTo(currentIndex + 1));

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

loadCachedStationMetadata();
restoreCurrentIndex();
renderStation(stations[currentIndex], 'POWER OFF');
updatePowerControl();
setMonitorMessage('POWER OFF');
refreshStationMetadata(true);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshStationMetadata();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./pyratedial-sw.js').catch(() => {}));
}
