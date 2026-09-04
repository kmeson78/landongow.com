const FM_MIN = 88.1;
const FM_MAX = 107.9;
const FM_STEP = 0.2;

// Pyrate Dial station map. Playlist IDs are fixed; YouTube itself remains
// the live source of each playlist's current videos. Public playlist titles are
// refreshed through YouTube oEmbed so names can follow future renames without
// a Google API key.
const STATIONS = [
  { frequency: 88.3, name: "Wilt Josey", playlistId: "PLtJfKjV02nK5zvGMYE_m1PTvX2v1ykTTm" },
  { frequency: 89.1, name: "Poet Row", playlistId: "PLf4jefl9i4GE" },
  { frequency: 90.7, name: "Basement Tapes", playlistId: "PLtJfKjV02nK47AU54zBeTv3Xq-RmmW_E3" },
  { frequency: 91.1, name: "Little Red Songbook", playlistId: "PLCcf-gNtNssc" },
  { frequency: 91.7, name: "Test Pattern", playlistId: "PLEZbyDYLyoeg" },
  { frequency: 92.5, name: "The Epidemic", playlistId: "PLPPUTf_kY4p4" },
  { frequency: 93.9, name: "Atomic Hits", playlistId: "PLtJfKjV02nK7H_fNgiYZSwF8wAilPBOcC" },
  { frequency: 94.7, name: "Standby Signal", playlistId: "PLQUHC3DmiKi8" },
  { frequency: 95.7, name: "Martin's Corner", playlistId: "PLtJfKjV02nK5zLBM_-OF4FH46GGVtEYz-" },
  { frequency: 96.9, name: "Dead Air", playlistId: "PLOG7V5TNJmjI" },
  { frequency: 98.3, name: "Tivel Hour", playlistId: "PLtJfKjV02nK6PLkS4mVlWNOiD-q2tIUxe" },
  { frequency: 99.9, name: "Sleepy Mountain", playlistId: "PLtJfKjV02nK5iUqUFnSQvqucBBfg93twL" },
  { frequency: 100.7, name: "Joshua's Barstool", playlistId: "PLtJfKjV02nK6_nR9NkG1JuiRPWP_IANjY" },
  { frequency: 101.5, name: "Sentimental Hits", playlistId: "PLtJfKjV02nK70xTDAe9HERw9vdoFS4sjf" },
  { frequency: 102.3, name: "Bird Song", playlistId: "PLtJfKjV02nK4esMJ3uDBL5Zy2-mCEykui" },
  { frequency: 103.1, name: "H.C. Catalog", playlistId: "PLtJfKjV02nK7uOl7VZ7EwpLk9pfBXOw6P" },
  { frequency: 104.9, name: "Helles Welles", playlistId: "PLtJfKjV02nK7ZhssFluZx_bsEAya0DqtP" },
  { frequency: 105.7, name: "Jurado Way", playlistId: "PLtJfKjV02nK4m5iHY8-6wOGed8wb3pxGe" },
  { frequency: 106.9, name: "Calibration", playlistId: "PLTsu7Jw8TppY" },
  { frequency: 107.9, name: "Ultimate Endless", playlistId: "PLtJfKjV02nK7EiGIkgk8QYFhA1wZRAlSc" }
].sort((a, b) => a.frequency - b.frequency);

let stations = STATIONS;
let currentIndex = 0;
let seekTimer = null;
let deferredInstallPrompt = null;

// YouTube player state.
let ytPlayer = null;
let ytPlayerReady = false;
let pendingStation = null;
let pendingCueToken = 0;
let audioUnlocked = false;
let currentPlaylistId = null;
let startRetryTimer = null;

const receiver = document.querySelector('.receiver');
const monitorBay = document.querySelector('.monitor-bay');
const monitorStandby = document.getElementById('monitorStandby');
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


const OEMBED_REFRESH_MS = 30 * 60 * 1000;
const OEMBED_CACHE_KEY = 'pyrateDial.stationMetadata';

function parseStationTitle(title, expectedFrequency) {
  if (typeof title !== 'string') return null;
  // Official station convention: 93.9 — Atomic Hits. Also tolerate a plain
  // hyphen in case YouTube/mobile keyboards normalize the separator.
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
    } catch (_) {
      // Metadata refresh is optional. Playback never depends on it.
    }
  }));

  if (Object.keys(updates).length) {
    let previous = {};
    try { previous = JSON.parse(localStorage.getItem(OEMBED_CACHE_KEY) || '{}') || {}; } catch (_) {}
    localStorage.setItem(OEMBED_CACHE_KEY, JSON.stringify({ ...previous, ...updates }));
  }
  localStorage.setItem(`${OEMBED_CACHE_KEY}.updated`, String(Date.now()));

  // Re-render only the label. Never interrupt whatever is currently playing.
  renderStation(stations[currentIndex]);
}

function restoreCurrentIndex() {
  const remembered = Number(localStorage.getItem('pyrateDial.lastFrequency'));
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

function recentStartKey(playlistId) {
  return `pyrateDial.recentStarts.${playlistId}`;
}

function getRecentStarts(playlistId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentStartKey(playlistId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function rememberStart(playlistId, videoId) {
  if (!videoId) return;
  const recent = getRecentStarts(playlistId).filter(id => id !== videoId);
  recent.unshift(videoId);
  localStorage.setItem(recentStartKey(playlistId), JSON.stringify(recent.slice(0, 8)));
}

function chooseRandomStart(list, playlistId) {
  if (!Array.isArray(list) || !list.length) return 0;
  const recent = new Set(getRecentStarts(playlistId));
  const candidates = list
    .map((videoId, index) => ({ videoId, index }))
    .filter(item => !recent.has(item.videoId));
  const pool = candidates.length ? candidates : list.map((videoId, index) => ({ videoId, index }));
  return pool[Math.floor(Math.random() * pool.length)].index;
}

function startCuedPlaylist(token, attempt = 0) {
  if (!ytPlayerReady || !ytPlayer || token !== pendingCueToken || !pendingStation?.playlistId) return;

  try {
    ytPlayer.setShuffle(true);
    ytPlayer.setLoop(true);
    const list = ytPlayer.getPlaylist() || [];

    if (!list.length && attempt < 12) {
      clearTimeout(startRetryTimer);
      startRetryTimer = setTimeout(() => startCuedPlaylist(token, attempt + 1), 120);
      return;
    }

    const index = chooseRandomStart(list, pendingStation.playlistId);
    const chosenVideoId = list[index];
    rememberStart(pendingStation.playlistId, chosenVideoId);

    // Muted playback is allowed to start without a gesture on iOS. The first
    // touch anywhere on the receiver unmutes the same player; no extra visible
    // playback control is added.
    if (audioUnlocked) ytPlayer.unMute();
    else ytPlayer.mute();

    ytPlayer.playVideoAt(index);
    revealPlayer();
    currentPlaylistId = pendingStation.playlistId;
    statusEl.textContent = audioUnlocked ? 'SIGNAL LOCK' : 'TOUCH TO START';
  } catch (error) {
    console.warn('Pyrate Dial could not start playlist:', error);
    statusEl.textContent = 'SIGNAL HOLD';
  }
}

function tunePlayerToStation(station) {
  pendingStation = station;
  pendingCueToken += 1;
  const token = pendingCueToken;
  clearTimeout(startRetryTimer);

  if (!station?.playlistId) {
    currentPlaylistId = null;
    setMonitorMessage('NO SIGNAL');
    statusEl.textContent = 'NO LINK';
    if (ytPlayerReady && ytPlayer) {
      try { ytPlayer.stopVideo(); } catch (_) {}
    }
    return;
  }

  if (!ytPlayerReady || !ytPlayer) {
    setMonitorMessage('LINKING');
    statusEl.textContent = 'LINKING';
    return;
  }

  setMonitorMessage('TUNING');
  statusEl.textContent = 'TUNING';

  try {
    // Cue first so YouTube exposes the playlist to getPlaylist(). Then we
    // explicitly choose a random starting item instead of accepting item 1.
    ytPlayer.cuePlaylist({
      listType: 'playlist',
      list: station.playlistId,
      index: 0,
      startSeconds: 0
    });
    // CUED event normally starts the shuffled selection. Keep a timed fallback
    // in case a browser does not emit it reliably.
    setTimeout(() => startCuedPlaylist(token), 350);
  } catch (error) {
    console.warn('Pyrate Dial playlist cue failed:', error);
    statusEl.textContent = 'SIGNAL HOLD';
  }
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
      tunePlayerToStation(stations[currentIndex]);
      return;
    }

    frequencyEl.textContent = formatFrequency(displayed);
    markerEl.style.left = `${clamp(markerPosition(displayed), 0, 100)}%`;
  }, 29);
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  if (!ytPlayerReady || !ytPlayer) return;

  try {
    ytPlayer.unMute();
    ytPlayer.setVolume(100);
    const state = ytPlayer.getPlayerState();
    if (state !== YT.PlayerState.PLAYING && currentPlaylistId) ytPlayer.playVideo();
    if (currentPlaylistId) statusEl.textContent = 'SIGNAL LOCK';
  } catch (_) {}
}

// One natural touch anywhere on the receiver satisfies iPhone's user-gesture
// requirement. It does not add a new visible control.
receiver.addEventListener('pointerdown', unlockAudio, { passive: true });
prevButton.addEventListener('click', () => scanTo(currentIndex - 1));
nextButton.addEventListener('click', () => scanTo(currentIndex + 1));

// ----- Official YouTube IFrame Player API -----
window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('youtubePlayer', {
    width: '200',
    height: '200',
    playerVars: {
      autoplay: 1,
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
        ytPlayerReady = true;
        try { event.target.mute(); } catch (_) {}
        tunePlayerToStation(stations[currentIndex]);
      },
      onStateChange: event => {
        if (event.data === YT.PlayerState.CUED) {
          startCuedPlaylist(pendingCueToken);
        } else if (event.data === YT.PlayerState.PLAYING) {
          revealPlayer();
          statusEl.textContent = audioUnlocked ? 'SIGNAL LOCK' : 'TOUCH TO START';
        } else if (event.data === YT.PlayerState.BUFFERING) {
          statusEl.textContent = 'TUNING';
        }
      },
      onAutoplayBlocked: () => {
        statusEl.textContent = 'TOUCH TO START';
      },
      onError: event => {
        // Removed/private/unembeddable videos are skipped automatically.
        if ([100, 101, 150].includes(event.data)) {
          statusEl.textContent = 'AUTO SKIP';
          try { ytPlayer.nextVideo(); } catch (_) {}
          return;
        }
        statusEl.textContent = 'SIGNAL HOLD';
      }
    }
  });
};

(function loadYouTubeApi() {
  if (window.YT?.Player) {
    window.onYouTubeIframeAPIReady();
    return;
  }
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.async = true;
  const firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(tag, firstScript);
})();

// ----- PWA install handling -----
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

loadCachedStationMetadata();
restoreCurrentIndex();
renderStation(stations[currentIndex], 'LINKING');
refreshStationMetadata(true);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshStationMetadata();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./pyratedial-sw.js').catch(() => {}));
}
