const CACHE_NAME = 'pyrate-dial-recovery-v1';
const ASSETS = [
  './pyratedial.html',
  './pyratedial-recovery.css?v=1',
  './pyratedial-recovery.js?v=1',
  './pyratedial-manifest.webmanifest',
  './pyratedial-icon-192.png',
  './pyratedial-icon-512.png',
  './pyratedial-ship.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(hit => hit || caches.match('./pyratedial.html'))
      )
  );
});
