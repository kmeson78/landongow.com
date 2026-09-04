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

// ONE player for the whole session, built the first time a station is
// tapped and reused — never destroyed and rebuilt — for every tap after
// that. This is a direct correction: the previous version built a brand
// new iframe on every single tap, and the second tap onward consistently
// failed to autoplay. That matches something already proven once before in
// this same project on the dial page — a freshly built iframe, even
// created synchronously inside a real tap, does not reliably inherit
// autoplay permission the way a player that's been alive and playing since
// the first tap does. Reusing one iframe for the whole session is what
// keeps that permission intact.
let ytPlayer = null;
let tuneInFlight = false;
let activeIndex = null;

// Reusing one player means loadPlaylist() gets called again on a player
// that's already playing something — which is exactly the scenario that
// caused the ORIGINAL bug earlier in this project: a leftover event from
// the station before could arrive after the next one's already been
// requested, so the audio would land one tune behind the display.
// expectedStartIndex is the fix: the exact random index just requested.
// A PLAYING event only counts as real confirmation if the player's actual
// getPlaylistIndex() matches it — a stale event from the previous station
// essentially never coincidentally matches.
let expectedStartIndex = null;

const monitorBay = document.getElementById('monitorBay');
const monitorStandby = document.getElementById('monitorStandby');
const gridTop = document.getElementById('stationGridTop');
const gridBottom = document.getElementById('stationGridBottom');
const playerFrequencyEl = document.getElementById('playerFrequency');
const playerNameEl = document.getElementById('playerName');
const playerStatusEl = document.getElementById('playerStatus');

const formatFrequency = freq => Number(freq).toFixed(1);

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

// Called directly from a station-button tap. If the player already exists,
// loadPlaylist() is called synchronously, right here, on the same live
// iframe that's been alive since the very first tap — never on a newly
// built one.
function playStation(targetIndex) {
  const station = stations[targetIndex];
  if (!station?.playlistId) return;
  if (!ytPlayer && !apiReady) {
    setStatus('WARMING UP');
    return;
  }

  activeIndex = targetIndex;
  tuneInFlight = true;
  updateActiveButtonStyling();
  setButtonsBusy(true);
  setMonitorMessage('TUNING');
  setStatus('TUNING');
  playerFrequencyEl.textContent = formatFrequency(station.frequency);
  playerNameEl.textContent = station.name;

  expectedStartIndex = chooseRandomIndex(station);

  const doLoad = player => {
    try {
      player.mute();
      player.loadPlaylist({
        listType: 'playlist',
        list: station.playlistId,
        index: expectedStartIndex,
        startSeconds: 0
      });
    } catch (error) {
      console.warn('Pyrate Dial station load failed:', error);
      setStatus('SIGNAL HOLD');
      tuneInFlight = false;
      activeIndex = null;
      updateActiveButtonStyling();
      setButtonsBusy(false);
    }
  };

  if (ytPlayer) {
    doLoad(ytPlayer);
  } else {
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
          setIframePermissions(event.target);
          try {
            event.target.mute();
            event.target.setVolume(100);
          } catch (_) {}
          doLoad(event.target);
        },
        onStateChange: handlePlayerStateChange,
        onAutoplayBlocked: handleAutoplayBlocked,
        onError: handlePlayerError
      }
    });
  }
}

function handlePlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    if (tuneInFlight) {
      let actualIndex = null;
      try { actualIndex = event.target.getPlaylistIndex(); } catch (_) {}

      if (actualIndex !== expectedStartIndex) {
        // Stale event from the previous station — ignore it and keep
        // waiting; the real confirmation for THIS request is still coming.
        return;
      }

      tuneInFlight = false;
      setButtonsBusy(false);
      revealPlayer();
      try {
        event.target.unMute();
        event.target.setVolume(100);
        // Shuffle only reorders what plays NEXT, per YouTube's own docs —
        // it does not change the video already underway. Safe here.
        event.target.setShuffle(true);
      } catch (_) {}
      setStatus('SIGNAL LOCK');
    } else {
      // Normal in-playlist advance to the next song — not a new tune.
      revealPlayer();
      setStatus('SIGNAL LOCK');
    }
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
}

function handleAutoplayBlocked() {
  if (!tuneInFlight) return;
  tuneInFlight = false;
  activeIndex = null;
  updateActiveButtonStyling();
  setButtonsBusy(false);
  setStatus('TAP AGAIN');
}

function handlePlayerError(event) {
  if ([100, 101, 150].includes(event.data)) {
    setStatus('AUTO SKIP');
    try {
      event.target.nextVideo();
      event.target.playVideo();
    } catch (_) {}
    return;
  }
  if (tuneInFlight) {
    tuneInFlight = false;
    activeIndex = null;
    updateActiveButtonStyling();
    setButtonsBusy(false);
  }
  setStatus('SIGNAL HOLD');
}

// Stopping pauses and mutes rather than destroying the player — keeping
// the same iframe alive is the whole point, so the next tap after a stop
// still benefits from the autoplay permission it already earned.
function stopPlayback() {
  tuneInFlight = false;
  activeIndex = null;
  updateActiveButtonStyling();
  setButtonsBusy(false);
  if (ytPlayer) {
    try {
      ytPlayer.pauseVideo();
      ytPlayer.mute();
    } catch (_) {}
  }
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
