/* Pyrate Dial — small shared utilities, not a replacement for either receiver.
 * Desktop still creates a player per tune. Phone still uses a normal iframe
 * and real page navigation. Neither receiver needs an API key or song counts.
 * Reference: https://developers.google.com/youtube/iframe_api_reference
 */
(() => {
  'use strict';
  const BUILD = '20260915-r2';
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const memory = new Map();
  const storage = {
    get(key) {
      try { return localStorage.getItem(key) ?? memory.get(key) ?? null; }
      catch (_) { return memory.get(key) ?? null; }
    },
    set(key, value) {
      memory.set(key, String(value));
      try { localStorage.setItem(key, String(value)); } catch (_) {}
    },
    json(key, fallback) {
      try { return JSON.parse(this.get(key) || 'null') ?? fallback; }
      catch (_) { return fallback; }
    }
  };

  function call(player, method, ...args) {
    try { return player?.[method]?.(...args); } catch (_) { return undefined; }
  }
  function currentVideoId(player) {
    try {
      const id = new URL(player.getVideoUrl()).searchParams.get('v');
      return VIDEO_ID.test(id || '') ? id : '';
    } catch (_) { return ''; }
  }
  function playlist(player) {
    const list = call(player, 'getPlaylist');
    return Array.isArray(list) ? list : [];
  }
  function recentKey(station) { return `pyrateDial.recentVideoIds.v2.${station.playlistId}`; }
  function recentIds(station) {
    const ids = storage.json(recentKey(station), []);
    return Array.isArray(ids) ? ids.filter(id => VIDEO_ID.test(id)) : [];
  }
  function rememberVideo(station, id) {
    if (!VIDEO_ID.test(id || '')) return;
    const ids = [id, ...recentIds(station).filter(previous => previous !== id)].slice(0, 8);
    storage.set(recentKey(station), JSON.stringify(ids));
  }
  function chooseVideo(station, ids, random = Math.random) {
    // Retain the original indices. Filtering invalid IDs must not renumber them.
    const seen = new Set();
    const candidates = [];
    ids.forEach((id, index) => {
      if (typeof id === 'string' && VIDEO_ID.test(id) && !seen.has(id)) {
        candidates.push({ id, index });
        seen.add(id);
      }
    });
    if (!candidates.length) return null;
    const recent = recentIds(station).slice(0, Math.max(0, candidates.length - 1));
    const fresh = candidates.filter(entry => !recent.includes(entry.id));
    const pool = fresh.length ? fresh : candidates;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  }
  function randomTuneSeconds(duration, random = Math.random) {
    // No arbitrary timestamp when duration is unknown; leave tiny clips intact.
    if (!Number.isFinite(duration) || duration < 45) return 0;
    const low = duration * 0.15;
    const high = Math.min(duration * 0.75, duration - 30);
    return high > low ? Math.floor(low + random() * (high - low)) : 0;
  }

  /** One preparation pass, used only when arriving at a station.
   * It never seeks again after the user starts sound or the next song begins.
   * Its owner controls the actual iframe, audible playback, and navigation.
   */
  function prepareArrival(player, station, onDone) {
    let phase = 'list';
    let timer = null;
    let done = false;
    let expectedId = '';
    let failedId = '';
    let seekId = '';
    let offset = 0;
    let seekStarted = 0;
    let selectedAt = 0;
    let shuffled = false;
    let signature = '';
    let stableSince = 0;
    let durationSample = null;
    let sampleAt = 0;
    const started = Date.now();

    function shuffleOnce() {
      if (shuffled) return;
      shuffled = true;
      call(player, 'setLoop', true);
      call(player, 'setShuffle', true);
    }
    function finish(reason = 'ready') {
      if (done) return;
      done = true;
      clearTimeout(timer);
      shuffleOnce();
      const id = currentVideoId(player);
      if (call(player, 'getPlayerState') === 1) rememberVideo(station, id);
      onDone?.({ reason, videoId: id, offset });
    }
    function liveHint() {
      // Best-effort hint only: not all embedded-player builds expose this field.
      const data = call(player, 'getVideoData');
      return Boolean(data && (data.isLive === true || data.isLiveContent === true));
    }
    function seekOnce(duration) {
      if (phase === 'seeking' || done || liveHint()) return false;
      offset = randomTuneSeconds(duration);
      if (!offset) return false;
      seekId = currentVideoId(player);
      phase = 'seeking'; // Set before sending the asynchronous player command.
      seekStarted = Date.now();
      call(player, 'seekTo', offset, true);
      return true;
    }
    function poll() {
      if (done) return;
      const now = Date.now();
      const state = call(player, 'getPlayerState');
      const id = currentVideoId(player);
      if (now - started > 10000) { finish('timeout'); return; }

      if (phase === 'list') {
        const ids = playlist(player);
        const nextSignature = ids.join(',');
        if (ids.length && nextSignature !== signature) {
          signature = nextSignature;
          stableSince = now;
        }
        if (ids.length && now - stableSince >= 250) {
          const choice = chooseVideo(station, ids);
          if (choice) {
            expectedId = choice.id;
            selectedAt = now;
            phase = 'video';
            // No shuffle before this index is applied: that would change its meaning.
            call(player, 'playVideoAt', choice.index);
          } else {
            phase = 'fallback';
            shuffleOnce();
            call(player, 'nextVideo');
          }
        } else if (now - started > 3500) {
          // Retain the phone receiver's native shuffle/next fallback. No guessed index.
          phase = 'fallback';
          shuffleOnce();
          call(player, 'nextVideo');
          call(player, 'playVideo');
        }
      } else if (phase === 'fallback') {
        if (state === 1 && id) {
          expectedId = id;
          selectedAt = now;
          phase = 'video';
        }
      } else if (phase === 'replacement') {
        if (state === 1 && id && id !== failedId) {
          expectedId = id;
          selectedAt = now;
          durationSample = null;
          phase = 'video';
        }
      } else if (phase === 'video') {
        if (expectedId && id === expectedId && state === 1) {
          shuffleOnce();
          const duration = Number(call(player, 'getDuration'));
          if (liveHint()) { finish('live'); return; }
          if (duration > 0) {
            if (durationSample === null) {
              durationSample = duration;
              sampleAt = now;
            } else if (now - sampleAt >= 1100) {
              // A growing duration can be a live broadcast. Do not rewind it.
              if (duration > durationSample + 0.5) { finish('growing-duration'); return; }
              if (!seekOnce(duration)) { finish('short-recording'); return; }
            }
          }
        } else if (state === 1 && id && now - selectedAt > 4000) {
          // YouTube may skip a restricted choice itself. Accept its playable replacement.
          expectedId = id;
          durationSample = null;
          selectedAt = now;
        }
      } else if (phase === 'seeking') {
        if (id && id !== seekId) { finish('video-changed'); return; }
        const time = Number(call(player, 'getCurrentTime'));
        if (state === 1 && time >= offset - 3 && time <= offset + 15) {
          finish('seek-confirmed'); return;
        }
        if (now - seekStarted > 3500) { finish('seek-timeout'); return; }
      }
      timer = setTimeout(poll, 150);
    }

    timer = setTimeout(poll, 0);
    return {
      get done() { return done; },
      // Called synchronously inside the user's tap. Do not schedule an unmute later.
      finishForGesture() {
        if (done) return;
        if (phase === 'video' && currentVideoId(player) === expectedId) {
          const duration = Number(call(player, 'getDuration'));
          if (duration > 0) seekOnce(duration);
        }
        finish('user-gesture');
      },
      blocked() { finish('autoplay-blocked'); },
      videoFailed() {
        if (done) return;
        failedId = currentVideoId(player);
        phase = 'replacement';
        durationSample = null;
      },
      cancel() { done = true; clearTimeout(timer); }
    };
  }

  // Title metadata is optional. Failed requests never block playback.
  // A new namespace prevents the old cached "Standby Signal" label resurfacing.
  const META_KEY = 'pyrateDial.stationMetadata.v2';
  const REFRESH_MS = 30 * 60 * 1000;
  let refreshing = false;
  function loadNames(stations) {
    const saved = storage.json(META_KEY, {});
    for (const station of stations) {
      station.configName = station.name;
      const entry = saved?.[station.playlistId];
      if (entry?.configName === station.configName && typeof entry.name === 'string') {
        station.name = entry.name;
      }
    }
  }
  async function refreshNames(stations, onChange, force = false) {
    if (refreshing || (!force && Date.now() - Number(storage.get(`${META_KEY}.updated`)) < REFRESH_MS)) return;
    refreshing = true;
    try {
      const saved = storage.json(META_KEY, {});
      const updated = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {};
      await Promise.all(stations.map(async station => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        try {
          const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(station.playlistId)}`;
          const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
            mode: 'cors', cache: 'no-store', signal: controller.signal
          });
          if (!response.ok) return;
          const data = await response.json();
          const match = typeof data.title === 'string' && data.title.trim().match(/^(\d{2,3}\.\d)\s*(?:—|–|-)\s*(.+)$/);
          if (!match || Math.abs(Number(match[1]) - station.frequency) > 0.001) return;
          const name = match[2].trim();
          if (!name || name.length > 100) return;
          station.name = name;
          updated[station.playlistId] = { name, configName: station.configName || station.name };
        } catch (_) { /* Cached/configured name is sufficient. */ }
        finally { clearTimeout(timer); }
      }));
      storage.set(META_KEY, JSON.stringify(updated));
      storage.set(`${META_KEY}.updated`, Date.now());
      onChange?.();
    } finally { refreshing = false; }
  }

  let apiPromise = null;
  function loadYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      let settled = false;
      const previous = window.onYouTubeIframeAPIReady;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        error ? reject(error) : resolve();
      };
      const timeout = setTimeout(() => finish(new Error('YouTube player did not load.')), 16000);
      window.onYouTubeIframeAPIReady = () => {
        try { previous?.(); } catch (_) {}
        finish();
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => finish(new Error('YouTube player could not be reached.'));
      document.head.appendChild(tag);
    }).catch(error => { apiPromise = null; throw error; });
    return apiPromise;
  }

  async function registerWorker(scriptName, pageName) {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    try {
      const base = new URL('./', location.href);
      const registration = await navigator.serviceWorker.register(new URL(scriptName, base).href, {
        scope: new URL(pageName, base).href,
        updateViaCache: 'none'
      });
      // Retire only this application's former whole-directory registration.
      // Never remove another site's/app's service worker.
      const old = await navigator.serviceWorker.getRegistrations();
      const owned = new Set(['pyratedial-sw.js', 'pyratedial-app-sw.js'].map(name => new URL(name, base).pathname));
      for (const entry of old) {
        if (entry.scope !== base.href) continue;
        const workers = [entry.active, entry.waiting, entry.installing].filter(Boolean);
        if (workers.length && workers.every(worker => owned.has(new URL(worker.scriptURL).pathname))) {
          await entry.unregister();
        }
      }
      // Updates take effect on the next navigation. Never reload during a song.
      registration.update().catch(() => {});
    } catch (error) { console.warn('Pyrate Dial offline shell unavailable:', error.message); }
  }

  window.PyrateDial = Object.freeze({
    BUILD, storage, call, currentVideoId, playlist, rememberVideo, chooseVideo,
    randomTuneSeconds, prepareArrival, loadNames, refreshNames, loadYouTubeApi,
    registerWorker
  });
})();
