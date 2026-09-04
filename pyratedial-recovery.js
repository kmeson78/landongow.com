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
let deferredInstallPrompt = null;

// One persistent YouTube player. Nothing is loaded until POWER is pressed.
let ytPlayer = null;
let playerReady = false;
let powered = false;
let requestedStation = null;

// Tuning state. These two flags are the whole race fix:
// - animating is true only while the cosmetic frequency sweep is running.
// - tuneInFlight is true from the moment we call loadPlaylist() until the
//   YouTube player actually confirms (via onStateChange PLAYING) that the
//   requested station is the one making sound. While either is true, AUTO
//   TUNE and POWER are disabled, so a second command can never be issued
//   before the first one has resolved. That's what eliminates the old
//   "display says one station, audio is another" drift: there is never a
//   moment where two loadPlaylist() calls are in flight at once.
let animating = false;
let tuneInFlight = false;
let pendingIndex = null;

const receiver = document.querySelector('.receiver');
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
  // Don't repaint the display mid-tune — that's exactly the kind of stray
  // write that used to make the name/frequency drift from what's playing.
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

// Fixed-duration sweep, independent of how many stations apart the jump is.
// The old version stepped 0.2 MHz every 29ms, so a jump from 88.3 to 107.9
// took nearly 3 seconds of dead time before anything else could happen —
// that's a real source of the "lag" on AUTO TUNE, separate from the
// playback race. This always takes the same ~300ms regardless of distance.
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

// Called directly from a POWER or AUTO TUNE tap — that keeps the YouTube
// command inside the user's gesture on iPhone. Muting immediately (before
// loadPlaylist even fires) means no leftover audio from the previous
// station can bleed through while the new one loads. The station/display
// name is NOT updated here — it's finalized only once onStateChange
// confirms PLAYING for this exact request, in the player events block
// below. That's what guarantees the display always matches the audio.
function beginStationLoad(station, targetIndex) {
  if (!powered || !playerReady || !ytPlayer || !station?.playlistId) return;

  tuneInFlight = true;
  pendingIndex = targetIndex;
  requestedStation = station;
  syncControlAvailability();
  setMonitorMessage('TUNING');
  statusEl.textContent = 'TUNING';

  const startIndex = chooseRandomIndex(station);

  try {
    ytPlayer.mute();
    ytPlayer.loadPlaylist({
      listType: 'playlist',
      list: station.playlistId,
      index: startIndex,
      startSeconds: 0
    });
    ytPlayer.playVideo();
  } catch (error) {
    console.warn('Pyrate Dial station load failed:', error);
    statusEl.textContent = 'SIGNAL HOLD';
    tuneInFlight = false;
    pendingIndex = null;
    syncControlAvailability();
  }
}

function powerOnReceiver() {
  if (!playerReady || !ytPlayer) {
    statusEl.textContent = 'WARMING UP';
    return;
  }
  if (tuneInFlight || animating) return;

  powered = true;
  updatePowerControl();
  beginStationLoad(stations[currentIndex], currentIndex);
}

function powerOffReceiver() {
  powered = false;
  requestedStation = null;
  pendingIndex = null;
  tuneInFlight = false;
  updatePowerControl();
  try {
    ytPlayer.pauseVideo();
    ytPlayer.mute();
  } catch (_) {}
  setMonitorMessage('POWER OFF');
  statusEl.textContent = 'POWER OFF';
  syncControlAvailability();
}

function togglePower() {
  if (powered) powerOffReceiver();
  else powerOnReceiver();
}

// AUTO TUNE. No more "power off, wait, require a second POWER press."
// If the receiver is on, the new playlist loads immediately, in the same
// tap — the frequency sweep runs purely as a visual overlay on top of it.
function scanTo(targetIndex) {
  if (targetIndex < 0 || targetIndex >= stations.length || targetIndex === currentIndex) return;
  if (tuneInFlight || animating) return;

  const startFrequency = stations[currentIndex].frequency;
  const targetStation = stations[targetIndex];

  receiver.classList.add('seeking');
  stationNameEl.textContent = '—';
  statusEl.textContent = 'AUTO SEEK';

  if (powered) {
    beginStationLoad(targetStation, targetIndex);
  } else {
    // Receiver is off: this is just a selection change, nothing to play.
    currentIndex = targetIndex;
  }

  animateFrequencySweep(startFrequency, targetStation.frequency, () => {
    receiver.classList.remove('seeking');
    if (!powered) {
      renderStation(targetStation, 'POWER OFF');
    }
    // If powered, the display stays on "—" / current values until
    // onStateChange confirms the new station is actually audible.
  });
}

powerButton?.addEventListener('click', togglePower);
prevButton.addEventListener('click', () => scanTo(currentIndex - 1));
nextButton.addEventListener('click', () => scanTo(currentIndex + 1));

// ----- Official YouTube IFrame Player API -----
window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('youtubePlayer', {
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
        playerReady = true;
        setIframePermissions(event.target);
        try {
          event.target.mute();
          event.target.setVolume(100);
        } catch (_) {}
        updatePowerControl();
        setMonitorMessage('POWER OFF');
        statusEl.textContent = 'POWER OFF';
        syncControlAvailability();
      },
      onStateChange: event => {
        if (event.data === YT.PlayerState.PLAYING) {
          revealPlayer();
          if (powered) {
            try {
              event.target.unMute();
              event.target.setVolume(100);
              // Shuffle only reorders what plays NEXT — per YouTube's docs,
              // shuffling mid-playback does not change the video already
              // underway. Setting it here, once, after PLAYING is confirmed,
              // is safe and doesn't cause the jump-to-a-different-song
              // behavior the old "shuffle right after loadPlaylist" timing
              // was prone to.
              event.target.setShuffle(true);
            } catch (_) {}

            if (tuneInFlight) {
              // This PLAYING event is the confirmation for the request we
              // most recently issued — nothing else could have queued a
              // competing loadPlaylist() while tuneInFlight was true, so
              // there's no stale-event ambiguity to resolve.
              tuneInFlight = false;
              if (pendingIndex !== null) {
                currentIndex = pendingIndex;
                pendingIndex = null;
              }
              renderStation(requestedStation, 'SIGNAL LOCK');
            } else {
              // Normal in-playlist advance to the next song — not a tune.
              statusEl.textContent = 'SIGNAL LOCK';
            }
          } else {
            try { event.target.pauseVideo(); } catch (_) {}
            setMonitorMessage('POWER OFF');
          }
        } else if (event.data === YT.PlayerState.BUFFERING) {
          if (powered) statusEl.textContent = 'TUNING';
        } else if (event.data === YT.PlayerState.ENDED) {
          // Safety net for normal playlist advance only. Skip this while a
          // tune is in flight — an ENDED event from the OLD video can
          // arrive just after we've already issued loadPlaylist() for a
          // new station, and calling nextVideo() here would skip into the
          // playlist we just switched to, not the one that actually ended.
          if (powered && !tuneInFlight) {
            try {
              event.target.nextVideo();
              event.target.playVideo();
            } catch (_) {}
          }
        }
      },
      onAutoplayBlocked: () => {
        // POWER and AUTO TUNE are both deliberate user gestures. If WebKit
        // still blocks a load, clear the in-flight state so the next tap
        // (a fresh gesture) can retry cleanly.
        tuneInFlight = false;
        pendingIndex = null;
        syncControlAvailability();
        statusEl.textContent = powered ? 'TUNE AGAIN' : 'POWER OFF';
      },
      onError: event => {
        if ([100, 101, 150].includes(event.data)) {
          statusEl.textContent = 'AUTO SKIP';
          try {
            event.target.nextVideo();
            event.target.playVideo();
          } catch (_) {}
          return;
        }
        // A genuine failure mid-tune shouldn't leave the controls locked.
        if (tuneInFlight) {
          tuneInFlight = false;
          pendingIndex = null;
          syncControlAvailability();
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
        <li>Choose "Add to Home Screen."</li>
        <li>Tap "Add."</li>
      </ol>
      <p class="dialog-note">The Home Screen version opens directly as a standalone receiver.</p>
    `;
  } else {
    installInstructions.innerHTML = `
      <p>Use your browser's "Install app" or "Add to Home Screen" command to install Pyrate Dial on this device.</p>
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
