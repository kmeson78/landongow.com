/* Phone receiver. Keep plain iframe loading + real page-navigation presets.
 * The bridge prepares the initial shuffled recording while muted and supplies
 * TAP FOR SOUND. Live presets use the same button and the shared live controller.
 */
(() => {
  'use strict';
  const R = window.PyrateDial;
  const L = window.PyrateLive;
  const heroStatus = document.getElementById('heroStatus');
  if (!R || !L || !Array.isArray(window.PYRATE_STATIONS) ||
      window.PYRATE_DIRECTORY_BUILD !== R.BUILD || L.BUILD !== R.BUILD) {
    heroStatus.textContent = 'UPDATE FILES MISSING — RELOAD';
    return;
  }
  const stations = window.PYRATE_STATIONS.map(station => ({ ...station }));
  const presets = document.getElementById('presetStrip');
  const slot = document.getElementById('playerSlot');
  const frequencyEl = document.getElementById('heroFrequency');
  const nameEl = document.getElementById('heroName');
  const marker = document.getElementById('signalMarker');
  const format = value => Number(value).toFixed(1);
  let player = null;
  let arrival = null;
  let soundRequested = false;
  let failed = false;
  let disposed = false;
  let errors = 0;
  let lastVideo = '';
  let audioTimer = null;
  let endTimer = null;
  let readyTimer = null;

  let live = null;
  const activeIndex = R.requestedStationIndex(stations);
  const station = activeIndex === null ? null : stations[activeIndex];
  if (station) {
    // Preserve old frequency/index bookmarks, then replace them with stable IDs.
    try {
      const canonical = new URL(location.href);
      canonical.searchParams.delete('s');
      canonical.searchParams.delete('f');
      canonical.searchParams.set('station', station.id);
      history.replaceState(null, '', canonical.href);
    } catch (_) {}
  }

  function label(pill, entry) {
    pill.replaceChildren();
    const frequency = document.createElement('span');
    frequency.className = 'freq';
    frequency.textContent = format(entry.frequency);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name;
    pill.append(frequency, name);
  }
  function refreshLabels() {
    presets.querySelectorAll('.preset-pill').forEach(pill => label(pill, stations[Number(pill.dataset.index)]));
    if (station) {
      nameEl.textContent = station.name;
      document.title = `${format(station.frequency)} — ${station.name} · Pyrate Dial`;
    }
  }
  R.loadNames(stations);
  stations.forEach((entry, index) => {
    const pill = document.createElement('a');
    pill.className = 'preset-pill';
    pill.dataset.index = String(index);
    // Keep real navigation and the existing tap-active-station-to-stop behavior.
    pill.href = index === activeIndex ? 'pyratedial-app.html' : `pyratedial-app.html?station=${encodeURIComponent(entry.id)}`;
    label(pill, entry);
    if (index === activeIndex) {
      pill.classList.add('is-active');
      pill.setAttribute('aria-current', 'true');
    }
    presets.appendChild(pill);
  });

  function buildEmbedUrl(entry) {
    const params = new URLSearchParams({
      list: entry.playlistId, autoplay: '1', mute: '1', controls: '0',
      disablekb: '1', fs: '0', playsinline: '1', rel: '0', loop: '1',
      cc_load_policy: '0', enablejsapi: '1', origin: location.origin
    });
    // No guessed index parameter. The bridge chooses a real loaded video.
    return `https://www.youtube.com/embed/videoseries?${params}`;
  }

  if (!station) {
    frequencyEl.textContent = '—';
    nameEl.textContent = 'SELECT A STATION';
    heroStatus.textContent = 'STANDBY';
    marker.style.left = '50%';
  } else if (station.sourceType === 'live') {
    frequencyEl.textContent = format(station.frequency);
    nameEl.textContent = station.name;
    heroStatus.textContent = 'TAP FOR SOUND';
    marker.style.left = `${Math.max(0, Math.min(100, (station.frequency - 88.1) / 19.8 * 100))}%`;
    document.title = `${format(station.frequency)} — ${station.name} · Pyrate Dial`;
    const card = L.createCard(station);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'unmute-button';
    button.textContent = 'TAP FOR SOUND';
    button.setAttribute('aria-label', `Play ${station.name} live`);
    slot.replaceChildren(card, button);
    live = L.create({
      onStop: () => { location.href = 'pyratedial-app.html'; },
      onState(event) {
        if (disposed || !event.station || event.station.id !== station.id) return;
        L.paintCard(card, event.state);
        const messages = {
          connecting: 'TUNING LIVE', playing: 'LIVE SIGNAL', buffering: 'SIGNAL HOLD',
          blocked: 'TAP FOR SOUND', paused: 'TAP TO RESUME',
          offline: 'NO CONNECTION', error: 'SIGNAL LOST — RETRY'
        };
        heroStatus.textContent = messages[event.state] || 'TUNING LIVE';
        button.hidden = event.state === 'playing' || event.state === 'buffering';
        button.disabled = event.state === 'connecting';
        button.textContent = ({
          connecting: 'CONNECTING', paused: 'TAP TO RESUME', blocked: 'TAP FOR SOUND',
          error: 'RETRY STATION', offline: 'RETRY CONNECTION'
        })[event.state] || 'TAP FOR SOUND';
      }
    });
    // A home-screen launch does not grant autoplay. Connect only on this tap;
    // there is no hidden silent download or pre-roll before the listener starts.
    button.addEventListener('click', () => {
      if (disposed) return;
      if (live.currentStation) live.resume();
      else live.start(station);
    });
  } else {
    frequencyEl.textContent = format(station.frequency);
    nameEl.textContent = station.name;
    heroStatus.textContent = 'TUNING';
    marker.style.left = `${Math.max(0, Math.min(100, (station.frequency - 88.1) / 19.8 * 100))}%`;
    document.title = `${format(station.frequency)} — ${station.name} · Pyrate Dial`;
    const iframe = document.createElement('iframe');
    iframe.className = 'youtube-player';
    iframe.src = buildEmbedUrl(station);
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('title', `${station.name} — YouTube station video player`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'unmute-button';
    button.textContent = 'TAP FOR SOUND';
    button.disabled = true;
    slot.replaceChildren(iframe, button);

    function needsTap(message = 'TAP FOR SOUND') {
      if (disposed || failed) return;
      button.hidden = false;
      button.disabled = false;
      button.textContent = message;
      heroStatus.textContent = message;
    }
    function audioIsPlaying() {
      return R.call(player, 'getPlayerState') === 1 && R.call(player, 'isMuted') === false;
    }
    function confirmAudio() {
      clearTimeout(audioTimer);
      audioTimer = setTimeout(() => {
        if (disposed || failed || !soundRequested) return;
        if (audioIsPlaying()) {
          button.hidden = true;
          heroStatus.textContent = 'SIGNAL LOCK';
        } else { needsTap('TAP TO RESUME'); }
      }, 650);
    }
    function fatal(message) {
      failed = true;
      arrival?.cancel();
      clearTimeout(readyTimer);
      clearTimeout(audioTimer);
      clearTimeout(endTimer);
      R.call(player, 'pauseVideo');
      heroStatus.textContent = message;
      button.disabled = false;
      button.hidden = false;
      button.textContent = 'RETRY STATION';
    }
    function rememberCurrent() {
      const id = R.currentVideoId(player);
      if (id && id !== lastVideo) { lastVideo = id; R.rememberVideo(station, id); }
    }
    button.addEventListener('click', () => {
      if (failed) { location.reload(); return; }
      if (!player || disposed) return;
      // Do not await metadata here: unmute, volume and play must stay in the tap.
      soundRequested = true;
      arrival?.finishForGesture();
      R.call(player, 'unMute');
      R.call(player, 'setVolume', 100);
      R.call(player, 'playVideo');
      heroStatus.textContent = 'TUNING';
      confirmAudio();
    });

    readyTimer = setTimeout(() => { if (!disposed) fatal('YOUTUBE UNAVAILABLE — RETRY'); }, 18000);
    R.loadYouTubeApi().then(() => {
      if (disposed || failed) return;
      player = new window.YT.Player(iframe, {
        events: {
          onReady(event) {
            if (disposed || failed) { R.call(event.target, 'destroy'); return; }
            clearTimeout(readyTimer);
            player = event.target;
            button.disabled = false;
            R.call(player, 'mute');
            // Plain iframe already loaded the playlist. Only initial preparation
            // is added here; no desktop-style iframe replacement on phone.
            arrival = R.prepareArrival(player, station, () => {
              if (disposed || failed) return;
              rememberCurrent();
              if (soundRequested) confirmAudio();
              else needsTap();
            });
          },
          onStateChange(event) {
            if (disposed || failed) return;
            if (event.data === 1) {
              clearTimeout(endTimer);
              errors = 0;
              if (!arrival || !arrival.done) return;
              rememberCurrent();
              if (soundRequested && audioIsPlaying()) {
                button.hidden = true;
                heroStatus.textContent = 'SIGNAL LOCK';
              } else if (!soundRequested) { needsTap(); }
            } else if (event.data === 2 && soundRequested) {
              needsTap('TAP TO RESUME');
            } else if (event.data === 3 && soundRequested) {
              heroStatus.textContent = 'TUNING';
            } else if (event.data === 0 && arrival?.done) {
              const endedId = R.currentVideoId(player);
              clearTimeout(endTimer);
              endTimer = setTimeout(() => {
                if (!disposed && !failed && R.call(player, 'getPlayerState') === 0 &&
                    R.currentVideoId(player) === endedId) {
                  R.call(player, 'nextVideo');
                  R.call(player, 'playVideo');
                }
              }, 1800);
            }
          },
          onAutoplayBlocked() {
            if (disposed || failed) return;
            arrival?.blocked();
            needsTap(soundRequested ? 'TAP TO RESUME' : 'TAP FOR SOUND');
          },
          onError(event) {
            if (disposed || failed) return;
            if ([2, 5, 100, 101, 150].includes(event.data)) {
              errors += 1;
              const limit = Math.min(10, R.playlist(event.target).length || 5);
              if (errors >= limit) { fatal('NO PLAYABLE SIGNAL — RETUNE'); return; }
              arrival?.videoFailed();
              heroStatus.textContent = 'AUTO SKIP';
              R.call(event.target, 'nextVideo');
              R.call(event.target, 'playVideo');
            } else {
              fatal(event.data === 153 ? 'EMBED BLOCKED — RETUNE' : 'SIGNAL HOLD — RETRY');
            }
          }
        }
      });
    }).catch(() => { if (!disposed) fatal('YOUTUBE UNAVAILABLE — RETRY'); });
  }

  R.refreshNames(stations, refreshLabels);
  if (station) presets.querySelector('.is-active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') R.refreshNames(stations, refreshLabels);
  });
  window.addEventListener('pagehide', () => {
    disposed = true;
    live?.destroy();
    arrival?.cancel();
    clearTimeout(readyTimer);
    clearTimeout(audioTimer);
    clearTimeout(endTimer);
    R.call(player, 'mute');
    R.call(player, 'pauseVideo');
  });
  // An old phone page restored by Back must not revive a stale hidden player.
  window.addEventListener('pageshow', event => { if (event.persisted && disposed) location.reload(); });
  R.registerWorker('pyratedial-app-sw.js', 'pyratedial-app.html');
})();
