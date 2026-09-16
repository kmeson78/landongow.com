/* Desktop receiver. Keep the existing POWER and animated tune controls.
 * Each station still gets a fresh YouTube player; this is not the phone player.
 */
(() => {
  'use strict';
  const R = window.PyrateDial;
  const statusEl = document.getElementById('status');
  if (!R || !Array.isArray(window.PYRATE_STATIONS)) {
    statusEl.textContent = 'UPDATE FILES MISSING — RELOAD';
    return;
  }
  const stations = window.PYRATE_STATIONS.map(station => ({ ...station }));
  const receiver = document.querySelector('.receiver');
  const bay = document.querySelector('.monitor-bay');
  const screen = document.querySelector('.monitor-screen');
  const standby = document.getElementById('monitorStandby');
  const frequencyEl = document.getElementById('frequency');
  const nameEl = document.getElementById('stationName');
  const marker = document.getElementById('signalMarker');
  const prev = document.getElementById('prevStation');
  const next = document.getElementById('nextStation');
  const power = document.getElementById('powerButton');
  const format = value => Number(value).toFixed(1);
  const position = value => Math.max(0, Math.min(100, (value - 88.1) / (107.9 - 88.1) * 100));

  let currentIndex = stations.findIndex(s => s.frequency === Number(R.storage.get('pyrateDial.lastFrequency')));
  if (currentIndex < 0) currentIndex = stations.findIndex(s => s.frequency === 93.9);
  if (currentIndex < 0) currentIndex = 0;
  let powered = false;
  let apiReady = false;
  let player = null;
  let arrival = null;
  let token = 0;
  let busy = false;
  let animating = false;
  let animationId = null;
  let awaitingTap = false;
  let failed = false;
  let ready = false;
  let errors = 0;
  let lastVideo = '';
  let timeout = null;
  let endTimer = null;
  let audioTimer = null;

  function syncControls() {
    prev.disabled = busy || animating || currentIndex === 0;
    next.disabled = busy || animating || currentIndex === stations.length - 1;
    // POWER always remains available to cancel even a stalled tune.
    power.disabled = false;
    power.classList.toggle('is-on', powered);
    power.setAttribute('aria-pressed', String(powered));
    power.setAttribute('aria-label', awaitingTap ? 'Resume receiver sound' : 'Power receiver');
  }
  function renderStation() {
    const station = stations[currentIndex];
    frequencyEl.textContent = format(station.frequency);
    nameEl.textContent = station.name;
    marker.style.left = `${position(station.frequency)}%`;
    document.title = `${format(station.frequency)} — ${station.name} · Pyrate Dial`;
    R.storage.set('pyrateDial.lastFrequency', station.frequency);
    syncControls();
  }
  function showStandby(message) {
    bay.classList.remove('player-ready');
    standby.replaceChildren();
    const span = document.createElement('span');
    span.textContent = message;
    standby.appendChild(span);
    standby.style.display = 'grid';
  }
  function revealPlayer() {
    bay.classList.add('player-ready');
    standby.style.display = 'none';
  }
  function clearPlayer() {
    arrival?.cancel();
    arrival = null;
    clearTimeout(timeout);
    clearTimeout(endTimer);
    clearTimeout(audioTimer);
    R.call(player, 'mute');
    R.call(player, 'destroy');
    player = null;
    ready = false;
    screen.querySelectorAll('iframe, .youtube-player').forEach(node => node.remove());
  }
  function needTap(message = 'PRESS POWER FOR SOUND') {
    if (!powered) return;
    busy = false;
    awaitingTap = true;
    statusEl.textContent = message;
    syncControls();
  }
  function audioIsPlaying() {
    return R.call(player, 'getPlayerState') === 1 && R.call(player, 'isMuted') === false;
  }
  function confirmAudio(myToken) {
    clearTimeout(audioTimer);
    audioTimer = setTimeout(() => {
      if (myToken !== token || !powered || failed) return;
      if (audioIsPlaying()) {
        awaitingTap = false;
        statusEl.textContent = 'SIGNAL LOCK';
        syncControls();
      } else { needTap(); }
    }, 650);
  }
  function rememberCurrent() {
    const id = R.currentVideoId(player);
    if (id && id !== lastVideo) {
      lastVideo = id;
      R.rememberVideo(stations[currentIndex], id);
    }
  }
  function fatal(message) {
    arrival?.cancel();
    clearTimeout(timeout);
    clearTimeout(endTimer);
    clearTimeout(audioTimer);
    R.call(player, 'pauseVideo');
    failed = true;
    busy = false;
    awaitingTap = false;
    statusEl.textContent = message;
    syncControls();
  }

  function spinUpPlayer() {
    const myToken = ++token;
    clearPlayer();
    const station = stations[currentIndex];
    busy = true;
    awaitingTap = false;
    failed = false;
    errors = 0;
    lastVideo = '';
    statusEl.textContent = apiReady ? 'TUNING' : 'WARMING UP';
    showStandby('TUNING');
    syncControls();

    async function createPlayer() {
      try { await R.loadYouTubeApi(); apiReady = true; }
      catch (_) { if (myToken === token && powered) fatal('YOUTUBE UNAVAILABLE — PRESS POWER'); return; }
      if (myToken !== token || !powered) return;
      const container = document.createElement('div');
      container.className = 'youtube-player';
      screen.insertBefore(container, standby);
      timeout = setTimeout(() => {
        if (myToken !== token || !powered) return;
        if (ready) { arrival?.blocked(); needTap('SIGNAL HOLD — PRESS POWER'); }
        else { fatal('PLAYER UNAVAILABLE — PRESS POWER'); }
      }, 18000);

      player = new window.YT.Player(container, {
        width: '200', height: '200',
        playerVars: {
          autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1,
          rel: 0, cc_load_policy: 0, origin: location.origin
        },
        events: {
          onReady(event) {
            if (myToken !== token || !powered) { R.call(event.target, 'destroy'); return; }
            player = event.target;
            ready = true;
            const iframe = R.call(player, 'getIframe');
            iframe?.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
            iframe?.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            R.call(player, 'mute');
            R.call(player, 'setVolume', 100);
            revealPlayer();
            // 0 is a real initial position, not a guessed range. Selection follows
            // only after getPlaylist() returns the playlist actually loaded.
            try {
              player.loadPlaylist({ listType: 'playlist', list: station.playlistId, index: 0, startSeconds: 0 });
              arrival = R.prepareArrival(player, station, result => {
                if (myToken !== token || !powered || failed) return;
                busy = false;
                clearTimeout(timeout);
                if (!animating) renderStation();
                syncControls();
                rememberCurrent();
                if (result.reason === 'autoplay-blocked' || awaitingTap) { needTap(); return; }
                // Preserve desktop's existing automatic sound attempt. If rejected,
                // keep THIS player and let POWER resume it within a real gesture.
                R.call(player, 'unMute');
                R.call(player, 'setVolume', 100);
                R.call(player, 'playVideo');
                confirmAudio(myToken);
              });
            } catch (_) { fatal('SIGNAL HOLD — PRESS POWER'); }
          },
          onStateChange(event) {
            if (myToken !== token || !powered || failed) return;
            if (event.data === 1) {
              clearTimeout(endTimer);
              errors = 0;
              if (!arrival || !arrival.done) return;
              busy = false;
              rememberCurrent();
              if (audioIsPlaying()) {
                awaitingTap = false;
                statusEl.textContent = 'SIGNAL LOCK';
                syncControls();
              }
            } else if (event.data === 3) {
              if (!awaitingTap) statusEl.textContent = 'TUNING';
            } else if (event.data === 2 && arrival?.done) {
              needTap();
            } else if (event.data === 0 && arrival?.done) {
              // YouTube normally advances the playlist itself. Only intervene if
              // it remains ended on this same video; never double-skip a song.
              const endedId = R.currentVideoId(player);
              clearTimeout(endTimer);
              endTimer = setTimeout(() => {
                if (myToken === token && powered && !failed &&
                    R.call(player, 'getPlayerState') === 0 && R.currentVideoId(player) === endedId) {
                  R.call(player, 'nextVideo');
                  R.call(player, 'playVideo');
                }
              }, 1800);
            }
          },
          onAutoplayBlocked() {
            if (myToken !== token || !powered) return;
            awaitingTap = true;
            arrival?.blocked();
            clearTimeout(timeout);
            needTap();
          },
          onError(event) {
            if (myToken !== token || !powered || failed) return;
            if ([2, 5, 100, 101, 150].includes(event.data)) {
              errors += 1;
              const limit = Math.min(10, R.playlist(event.target).length || 5);
              if (errors >= limit) { fatal('NO PLAYABLE SIGNAL — RETUNE'); return; }
              arrival?.videoFailed();
              statusEl.textContent = 'AUTO SKIP';
              R.call(event.target, 'nextVideo');
              R.call(event.target, 'playVideo');
            } else {
              fatal(event.data === 153 ? 'EMBED BLOCKED — RETUNE' : 'SIGNAL HOLD — PRESS POWER');
            }
          }
        }
      });
    }
    createPlayer();
  }

  function powerOff() {
    powered = false;
    ++token;
    clearPlayer();
    if (animationId !== null) cancelAnimationFrame(animationId);
    animationId = null;
    animating = false;
    busy = false;
    awaitingTap = false;
    failed = false;
    receiver.classList.remove('seeking');
    showStandby('POWER OFF');
    statusEl.textContent = 'POWER OFF';
    renderStation();
  }
  power.addEventListener('click', () => {
    if (powered && awaitingTap && player && ready) {
      // These operations remain directly inside this click, never after an await.
      arrival?.finishForGesture();
      awaitingTap = false;
      busy = false;
      R.call(player, 'unMute');
      R.call(player, 'setVolume', 100);
      R.call(player, 'playVideo');
      statusEl.textContent = 'TUNING';
      syncControls();
      confirmAudio(token);
    } else if (powered && failed) { spinUpPlayer(); }
    else if (powered) { powerOff(); }
    else { powered = true; spinUpPlayer(); }
  });

  function scanTo(index) {
    if (busy || animating || index < 0 || index >= stations.length || index === currentIndex) return;
    const from = stations[currentIndex].frequency;
    currentIndex = index;
    const to = stations[currentIndex].frequency;
    animating = true;
    receiver.classList.add('seeking');
    nameEl.textContent = '—';
    statusEl.textContent = 'AUTO SEEK';
    if (powered) spinUpPlayer();
    syncControls();
    const started = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - started) / 300);
      const value = from + (to - from) * progress;
      frequencyEl.textContent = format(Math.round(value / 0.2) * 0.2);
      marker.style.left = `${position(value)}%`;
      if (progress < 1) { animationId = requestAnimationFrame(frame); return; }
      animationId = null;
      animating = false;
      receiver.classList.remove('seeking');
      renderStation();
      if (!powered) statusEl.textContent = 'POWER OFF';
    }
    animationId = requestAnimationFrame(frame);
  }
  prev.addEventListener('click', () => scanTo(currentIndex - 1));
  next.addEventListener('click', () => scanTo(currentIndex + 1));
  R.loadNames(stations);
  renderStation();
  showStandby('POWER OFF');
  statusEl.textContent = 'POWER OFF';
  R.loadYouTubeApi().then(() => { apiReady = true; }).catch(() => {});
  const refreshLabels = () => { if (!animating) renderStation(); };
  R.refreshNames(stations, refreshLabels);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') R.refreshNames(stations, refreshLabels);
  });
  window.addEventListener('pagehide', () => powerOff());
  R.registerWorker('pyratedial-sw.js', 'pyratedial.html');
})();
