/* Pyrate Dial — direct live audio, shared by the two existing receivers.
 * No YouTube changes, third-party player wrapper, proxy, pre-roll skipping,
 * silent keep-alive stream, or Web Audio/CORS dependency.
 * Call start()/resume() directly inside the user's click/tap, not after an await.
 * Reference: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play
 */
(() => {
  'use strict';
  const BUILD = '20260916-live1';

  function createCard(station) {
    const card = document.createElement('div');
    card.className = 'pyrate-live-card';
    card.dataset.state = 'ready';
    card.setAttribute('role', 'img');
    card.setAttribute('aria-label', `${station.name}, ${station.location}, live radio broadcast`);
    const top = document.createElement('span');
    top.className = 'pyrate-live-kicker';
    top.textContent = 'LIVE BROADCAST';
    const ship = document.createElement('img');
    ship.src = 'pyratedial-ship.png';
    ship.alt = '';
    ship.className = 'pyrate-live-ship';
    const name = document.createElement('strong');
    name.className = 'pyrate-live-name';
    name.textContent = station.name;
    const place = document.createElement('span');
    place.className = 'pyrate-live-place';
    place.textContent = station.location;
    const state = document.createElement('span');
    state.className = 'pyrate-live-state';
    state.textContent = 'READY';
    card.append(top, ship, name, place, state);
    return card;
  }
  function paintCard(card, state) {
    if (!card) return;
    card.dataset.state = state;
    const label = card.querySelector('.pyrate-live-state');
    if (label) label.textContent = ({
      ready: 'READY', connecting: 'CONNECTING', buffering: 'BUFFERING',
      playing: 'ON AIR', paused: 'PAUSED', blocked: 'TAP FOR SOUND',
      offline: 'NO CONNECTION', error: 'SIGNAL LOST', idle: 'OFF'
    })[state] || 'TUNING';
  }

  function create(options = {}) {
    const audio = document.createElement('audio');
    audio.className = 'pyrate-live-audio';
    audio.hidden = true;
    audio.preload = 'none';
    audio.autoplay = false;
    audio.loop = false;
    audio.controls = false;
    audio.setAttribute('playsinline', '');
    document.body.appendChild(audio);

    let station = null;
    let feeds = [];
    let feedIndex = 0;
    let phase = 'idle';
    let token = 0;
    let wanted = false;
    let destroyed = false;
    let startupTimer = null;
    let stallTimer = null;
    let listeners = [];
    let ownsMediaSession = false;
    let lastProgress = 0;
    const startupMs = options.startupMs || 25000;
    const stallMs = options.stallMs || 20000;
    const actionNames = ['play', 'pause', 'stop'];

    function mediaState(state) {
      if (!ownsMediaSession) return;
      try {
        navigator.mediaSession.playbackState = state === 'playing' ? 'playing' :
          (state === 'idle' ? 'none' : 'paused');
      } catch (_) {}
    }
    function emit(state, reason = '') {
      phase = state;
      mediaState(state);
      options.onState?.({ state, reason, station });
    }
    function timersOff() {
      clearTimeout(startupTimer);
      clearTimeout(stallTimer);
      startupTimer = stallTimer = null;
    }
    function release() {
      ++token;
      timersOff();
      listeners.forEach(([name, fn]) => audio.removeEventListener(name, fn));
      listeners = [];
      // pause + remove src + load closes the connection and abandons its buffer.
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    function clearMediaSession() {
      if (!ownsMediaSession) return;
      try {
        actionNames.forEach(action => {
          try { navigator.mediaSession.setActionHandler(action, null); } catch (_) {}
        });
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch (_) {}
      ownsMediaSession = false;
    }
    function setMediaSession() {
      if (!('mediaSession' in navigator) || !station) return;
      ownsMediaSession = true;
      try {
        if ('MediaMetadata' in window) {
          navigator.mediaSession.metadata = new window.MediaMetadata({
            title: `${Number(station.frequency).toFixed(1)} — ${station.name}`,
            artist: `${station.location} · Live broadcast`,
            album: 'Pyrate Dial',
            artwork: [
              { src: new URL('pyratedial-icon-192.png', location.href).href, sizes: '192x192', type: 'image/png' },
              { src: new URL('pyratedial-icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }
            ]
          });
        }
        const actions = { play: resume, pause, stop: () => {
          if (options.onStop) options.onStop(); else pause();
        } };
        actionNames.forEach(action => {
          try { navigator.mediaSession.setActionHandler(action, actions[action]); } catch (_) {}
        });
      } catch (_) { /* Media Session is optional; audio still works without it. */ }
    }
    function playableFeeds(entry) {
      const seen = new Set();
      const result = [];
      for (const feed of entry.streams || []) {
        try {
          const url = new URL(feed.url);
          if (url.protocol !== 'https:' || url.username || url.password || seen.has(url.href)) continue;
          seen.add(url.href);
          result.push({ url: url.href, type: feed.type || '', supported: Boolean(feed.type && audio.canPlayType(feed.type)) });
        } catch (_) {}
      }
      // Preference remains the station's configured order. canPlayType is only
      // a hint: when no format is recognized, let the browser try the feeds.
      return result.some(feed => feed.supported) ? result.filter(feed => feed.supported) : result;
    }
    function current(myToken) { return !destroyed && station && myToken === token; }
    function failed(myToken, reason) {
      if (!current(myToken) || !wanted) return;
      const next = feedIndex + 1;
      if (next < feeds.length) {
        // Only try each published alternative once. Never loop over pre-rolls.
        feedIndex = next;
        connect();
        return;
      }
      wanted = false;
      release();
      emit('error', reason);
    }
    function armStartup(myToken) {
      clearTimeout(startupTimer);
      startupTimer = setTimeout(() => {
        if (current(myToken) && wanted) failed(myToken, 'timeout');
      }, startupMs);
    }
    function play(myToken) {
      if (!current(myToken)) return;
      wanted = true;
      emit('connecting');
      armStartup(myToken);
      // Synchronous call preserves the tap/click's playback permission.
      let request;
      try { request = audio.play(); }
      catch (error) { rejected(myToken, error); return; }
      if (request && typeof request.catch === 'function') {
        request.catch(error => rejected(myToken, error));
      }
    }
    function rejected(myToken, error) {
      // Never pause here for a stale promise: this element may already be
      // playing another station. release() has disposed the old connection.
      if (!current(myToken) || !wanted) return;
      if (error?.name === 'NotAllowedError') {
        wanted = false;
        timersOff();
        emit('blocked', 'gesture-required');
      } else if (error?.name !== 'AbortError') {
        failed(myToken, error?.name || 'play-failed');
      }
    }
    function connect() {
      release();
      if (destroyed || !station) return;
      if (!feeds.length) { wanted = false; emit('error', 'no-secure-stream'); return; }
      wanted = true;
      if (navigator.onLine === false) { emit('offline'); return; }
      const myToken = token;
      const feed = feeds[feedIndex];
      const listen = (name, fn) => {
        const guarded = event => { if (current(myToken)) fn(event); };
        audio.addEventListener(name, guarded);
        listeners.push([name, guarded]);
      };
      const isOurSource = () => audio.currentSrc === feed.url;
      listen('playing', () => {
        if (!wanted || audio.paused || !isOurSource()) return;
        timersOff();
        lastProgress = Number(audio.currentTime) || 0;
        emit('playing');
      });
      listen('timeupdate', () => {
        if (!wanted || audio.paused || !isOurSource()) return;
        const time = Number(audio.currentTime) || 0;
        if (time > lastProgress + 0.1) {
          lastProgress = time;
          clearTimeout(stallTimer);
          stallTimer = null;
          if (phase === 'buffering') { clearTimeout(startupTimer); emit('playing'); }
        }
      });
      function buffering() {
        if (!wanted || !isOurSource() || (phase !== 'playing' && phase !== 'buffering')) return;
        emit('buffering');
        if (stallTimer !== null) return;
        const at = Number(audio.currentTime) || 0;
        stallTimer = setTimeout(() => {
          stallTimer = null;
          if (!current(myToken) || !wanted) return;
          if ((Number(audio.currentTime) || 0) <= at + 0.5) failed(myToken, 'stalled');
          else emit('playing');
        }, stallMs);
      }
      listen('waiting', buffering);
      // A stalled network can still have buffered audio; do not reconnect if
      // timeupdate shows that playback is continuing.
      listen('stalled', buffering);
      listen('pause', () => {
        if (!wanted || !audio.paused || (phase !== 'playing' && phase !== 'buffering')) return;
        // OS/headphone/interruption pauses must not trigger unwanted restarts.
        pause();
      });
      listen('ended', () => {
        if (wanted && isOurSource()) failed(myToken, 'broadcast-ended');
      });
      listen('error', () => {
        if (wanted && audio.error) failed(myToken, `media-${audio.error.code}`);
      });
      audio.src = feed.url;
      audio.muted = false;
      audio.load();
      play(myToken);
    }
    function start(entry) {
      if (destroyed) return;
      release();
      clearMediaSession();
      station = entry;
      feedIndex = 0;
      feeds = playableFeeds(entry);
      setMediaSession();
      connect();
    }
    function resume() {
      if (destroyed || !station) return;
      if (phase === 'blocked' && audio.getAttribute('src')) {
        // Reuse the already-loaded feed after an autoplay refusal.
        play(token);
      } else if (phase !== 'playing' && phase !== 'connecting' && phase !== 'buffering') {
        feedIndex = 0;
        connect();
      }
    }
    function pause() {
      if (destroyed || !station) return;
      wanted = false;
      release();
      emit('paused');
    }
    function stop() {
      wanted = false;
      release();
      station = null;
      feeds = [];
      feedIndex = 0;
      clearMediaSession();
      emit('idle');
    }
    function offline() {
      if (destroyed || !station || !wanted) return;
      release();
      emit('offline');
    }
    function online() {
      if (destroyed || !station || !wanted || phase !== 'offline') return;
      feedIndex = 0;
      connect();
    }
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    function destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      audio.remove();
    }
    return Object.freeze({ start, resume, pause, stop, destroy,
      get state() { return phase; },
      get currentStation() { return station; }
    });
  }
  window.PyrateLive = Object.freeze({ BUILD, create, createCard, paintCard });
})();
