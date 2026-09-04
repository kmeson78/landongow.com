const FM_MIN = 88.1;
const FM_MAX = 107.9;
const FM_STEP = 0.2;

// Fixed station map. YouTube remains the live source of each playlist's videos.
// Public playlist titles are refreshed through YouTube oEmbed, so renames can
// follow without a Google API key.
const STATIONS = [
  { frequency: 88.3, name: "Wilt Josey", playlistId: "PLtJfKjV02nK5zvGMYE_m1PTvX2v1ykTTm", probeVideoId: "rXYohGBqWfw" },
  { frequency: 89.1, name: "Poet Row", playlistId: "PLf4jefl9i4GE", probeVideoId: "iMMjAbH_W8c" },
  { frequency: 90.7, name: "Basement Tapes", playlistId: "PLtJfKjV02nK47AU54zBeTv3Xq-RmmW_E3", probeVideoId: "qaFbCrEBob0" },
  { frequency: 91.1, name: "Little Red Songbook", playlistId: "PLCcf-gNtNssc", probeVideoId: "M2tyW-68iik" },
  { frequency: 91.7, name: "Test Pattern", playlistId: "PLEZbyDYLyoeg", probeVideoId: "EqnUiEVgmAg" },
  { frequency: 92.5, name: "The Epidemic", playlistId: "PLPPUTf_kY4p4", probeVideoId: "pSO6nKgMUts" },
  { frequency: 93.9, name: "Atomic Hits", playlistId: "PLtJfKjV02nK7H_fNgiYZSwF8wAilPBOcC", probeVideoId: "LW9hwoaJXgw" },
  { frequency: 94.7, name: "Standby Signal", playlistId: "PLQUHC3DmiKi8", probeVideoId: "_Yvt99hHCxM" },
  { frequency: 95.7, name: "Martin's Corner", playlistId: "PLtJfKjV02nK5zLBM_-OF4FH46GGVtEYz-", probeVideoId: "bSMZjStLmd8" },
  { frequency: 96.9, name: "Dead Air", playlistId: "PLOG7V5TNJmjI", probeVideoId: "ubFq-wV3Eic" },
  { frequency: 98.3, name: "Tivel Hour", playlistId: "PLtJfKjV02nK6PLkS4mVlWNOiD-q2tIUxe", probeVideoId: "LzrB3LGtCDg" },
  { frequency: 99.9, name: "Sleepy Mountain", playlistId: "PLtJfKjV02nK5iUqUFnSQvqucBBfg93twL", probeVideoId: "mwWtIq1dJnE" },
  { frequency: 100.7, name: "Joshua's Barstool", playlistId: "PLtJfKjV02nK6_nR9NkG1JuiRPWP_IANjY", probeVideoId: "kEHFk2VtUL8" },
  { frequency: 101.5, name: "Sentimental Hits", playlistId: "PLtJfKjV02nK70xTDAe9HERw9vdoFS4sjf", probeVideoId: "YmFynsUrSz0" },
  { frequency: 102.3, name: "Bird Song", playlistId: "PLtJfKjV02nK4esMJ3uDBL5Zy2-mCEykui", probeVideoId: "a6NsUIwajLM" },
  { frequency: 103.1, name: "H.C. Catalog", playlistId: "PLtJfKjV02nK7uOl7VZ7EwpLk9pfBXOw6P", probeVideoId: "4m-Ectbqjs0" },
  { frequency: 104.9, name: "Helles Welles", playlistId: "PLtJfKjV02nK7ZhssFluZx_bsEAya0DqtP", probeVideoId: "DguEejdiE4Q" },
  { frequency: 105.7, name: "Jurado Way", playlistId: "PLtJfKjV02nK4m5iHY8-6wOGed8wb3pxGe", probeVideoId: "0itHpfua5fg" },
  { frequency: 106.9, name: "Calibration", playlistId: "PLTsu7Jw8TppY", probeVideoId: "Cnchea6LHN0" },
  { frequency: 107.9, name: "Ultimate Endless", playlistId: "PLtJfKjV02nK7EiGIkgk8QYFhA1wZRAlSc", probeVideoId: "YbkPZh4Nri4" }
].sort((a, b) => a.frequency - b.frequency);

let stations = STATIONS;
let currentIndex = 0;
let seekTimer = null;
let deferredInstallPrompt = null;

// One persistent YouTube player. Keeping the same iframe is important on iOS:
// station changes happen inside the AUTO TUNE button's user gesture, so sound
// can continue instead of losing autoplay permission while a new iframe loads.
let ytPlayer = null;
let ytApiReady = false;
let playerReady = false;
let audioUnlocked = false;
let activeStation = null;
let switchToken = 0;
let shuffleTimer = null;

const receiver = document.querySelector('.receiver');
const stationReadout = document.querySelector('.station-readout');
const monitorBay = document.querySelector('.monitor-bay');
const monitorStandby = document.getElementById('monitorStandby');
const frequencyEl = document.getElementById('frequency');
const stationNameEl = document.getElementById('stationName');
const markerEl = document.getElementById('signalMarker');
const statusEl = document.getElementById('status');
const prevButton = document.getElementById('prevStation');
const nextButton = document.getElementById('nextStation');
const powerButton = document.getElementById('powerButton');
const installButton = document.getElementById('installButton');
const installPanel = document.getElementById('installPanel');
const installDialog = document.getElementById('installDialog');
const installInstructions = document.getElementById('installInstructions');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const markerPosition = freq => ((freq - FM_MIN) / (FM_MAX - FM_MIN)) * 100;
const formatFrequency = freq => Number(freq).toFixed(1);

// ----- Station name refresh (no Google API key) -----
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
  renderStation(stations[currentIndex]);
}

// ----- Dial UI -----
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

function renderStation(station, status = null) {
  if (!station) return;
  frequencyEl.textContent = formatFrequency(station.frequency);
  stationNameEl.textContent = station.name;
  markerEl.style.left = `${clamp(markerPosition(station.frequency), 0, 100)}%`;
  if (status) statusEl.textContent = status;
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

// ----- Shuffle history -----
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

// ----- Playback -----
function setIframePermissions(player) {
  try {
    const iframe = player.getIframe();
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  } catch (_) {}
}

function updatePowerControl() {
  if (!powerButton) return;
  powerButton.classList.toggle('is-on', audioUnlocked);
  powerButton.setAttribute('aria-pressed', audioUnlocked ? 'true' : 'false');
}

function powerOnReceiver() {
  if (!ytPlayer || !playerReady) {
    statusEl.textContent = 'WARMING UP';
    return;
  }

  audioUnlocked = true;
  updatePowerControl();
  statusEl.textContent = 'TUNING';
  loadStationIntoExistingPlayer(stations[currentIndex], true);
}

function powerOffReceiver() {
  audioUnlocked = false;
  updatePowerControl();
  clearTimeout(shuffleTimer);
  switchToken += 1;
  activeStation = null;
  try {
    ytPlayer.mute();
    ytPlayer.pauseVideo();
  } catch (_) {}
  setMonitorMessage('POWER OFF');
  statusEl.textContent = 'POWER OFF';
}

function togglePower() {
  if (audioUnlocked) powerOffReceiver();
  else powerOnReceiver();
}

function finishShuffleForStation(station, token, attempt = 0) {
  if (token !== switchToken || !ytPlayer || activeStation !== station) return;

  let list = [];
  try { list = ytPlayer.getPlaylist() || []; } catch (_) {}

  // A fast station change can briefly leave the previous playlist in
  // getPlaylist(). Wait until a video known to belong to the requested station
  // appears. If that seed video is later removed from YouTube, fall back after
  // a short settling period instead of breaking the station.
  const looksLikeRequestedPlaylist = list.length && (
    !station.probeVideoId || list.includes(station.probeVideoId) || attempt >= 10
  );

  if (!looksLikeRequestedPlaylist) {
    if (attempt >= 20) {
      statusEl.textContent = audioUnlocked ? 'SIGNAL LOCK' : 'TOUCH DISPLAY FOR AUDIO';
      return;
    }
    clearTimeout(shuffleTimer);
    shuffleTimer = setTimeout(() => finishShuffleForStation(station, token, attempt + 1), 120);
    return;
  }

  try { ytPlayer.setShuffle(true); } catch (_) {}
  try { list = ytPlayer.getPlaylist() || list; } catch (_) {}

  if (list.length) {
    const index = chooseRandomStart(list, station.playlistId);
    const chosenVideoId = list[index];
    rememberStart(station.playlistId, chosenVideoId);
    try { ytPlayer.playVideoAt(index); } catch (_) {}
  }

  if (audioUnlocked) {
    try {
      ytPlayer.unMute();
      ytPlayer.setVolume(100);
    } catch (_) {}
  }
}

function loadStationIntoExistingPlayer(station, userInitiated = false) {
  if (!station?.playlistId || !ytPlayer || !playerReady) return;

  const token = ++switchToken;
  activeStation = station;
  clearTimeout(shuffleTimer);
  setMonitorMessage('TUNING');
  statusEl.textContent = 'TUNING';

  try {
    if (audioUnlocked) {
      // POWER has already supplied the deliberate iPhone audio gesture.
      // AUTO TUNE keeps using the same player and remains audible.
      ytPlayer.unMute();
      ytPlayer.setVolume(100);
    } else {
      ytPlayer.mute();
    }

    ytPlayer.loadPlaylist({
      listType: 'playlist',
      list: station.playlistId,
      index: 0,
      startSeconds: 0
    });

    if (userInitiated && audioUnlocked) {
      // AUTO TUNE happens inside a user gesture while the receiver is powered.
      ytPlayer.unMute();
      ytPlayer.setVolume(100);
      ytPlayer.playVideo();
    }

    shuffleTimer = setTimeout(() => finishShuffleForStation(station, token, 0), 160);
  } catch (error) {
    console.warn('Pyrate Dial station load failed:', error);
    statusEl.textContent = 'SIGNAL HOLD';
  }
}

function scanTo(targetIndex, userInitiated = false) {
  if (targetIndex < 0 || targetIndex >= stations.length || targetIndex === currentIndex) return;

  // Start the actual YouTube station switch NOW, while the AUTO TUNE click is
  // still a browser-recognized user gesture. The visible dial scan then catches
  // up over the next few tenths of a second.
  if (playerReady && userInitiated && audioUnlocked) {
    loadStationIntoExistingPlayer(stations[targetIndex], true);
  }

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
      renderStation(stations[currentIndex], audioUnlocked ? 'SIGNAL LOCK' : 'POWER OFF');
      receiver.classList.remove('seeking');

      // When powered, catch up if YouTube was not ready at the initial click.
      if (audioUnlocked && playerReady && activeStation !== stations[currentIndex]) {
        loadStationIntoExistingPlayer(stations[currentIndex], true);
      } else if (!audioUnlocked) {
        setMonitorMessage('POWER OFF');
      }
      return;
    }

    frequencyEl.textContent = formatFrequency(displayed);
    markerEl.style.left = `${clamp(markerPosition(displayed), 0, 100)}%`;
  }, 29);
}

powerButton?.addEventListener('click', togglePower);
prevButton.addEventListener('click', () => scanTo(currentIndex - 1, true));
nextButton.addEventListener('click', () => scanTo(currentIndex + 1, true));

// ----- Official YouTube IFrame Player API -----
window.onYouTubeIframeAPIReady = function () {
  ytApiReady = true;

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
        playerReady = true;
        setIframePermissions(event.target);
        try { event.target.mute(); } catch (_) {}
        updatePowerControl();
        setMonitorMessage('POWER OFF');
        statusEl.textContent = 'POWER OFF';
      },
      onStateChange: event => {
        if (event.data === YT.PlayerState.PLAYING) {
          revealPlayer();
          if (audioUnlocked) {
            try {
              event.target.unMute();
              event.target.setVolume(100);
            } catch (_) {}
            statusEl.textContent = 'SIGNAL LOCK';
          } else {
            try { event.target.mute(); } catch (_) {}
            statusEl.textContent = 'POWER OFF';
          }
        } else if (event.data === YT.PlayerState.BUFFERING) {
          statusEl.textContent = 'TUNING';
        } else if (event.data === YT.PlayerState.ENDED) {
          // YouTube normally advances playlists itself. This is only a safety
          // net for odd embeds that stop at the end of a one-item queue.
          try { event.target.nextVideo(); } catch (_) {}
        }
      },
      onAutoplayBlocked: () => {
        statusEl.textContent = audioUnlocked ? 'PRESS POWER AGAIN' : 'POWER OFF';
      },
      onError: event => {
        // Removed/private/unembeddable videos are skipped automatically.
        if ([100, 101, 150].includes(event.data)) {
          statusEl.textContent = 'AUTO SKIP';
          try { event.target.nextVideo(); } catch (_) {}
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
