/* Pyrate Dial shell cache. Never cache YouTube/audio, unrelated site files,
 * or replace a failed JS/image request with an HTML page.
 * Registered with a page-specific scope by this receiver, not the whole site.
 */
'use strict';
const BUILD = '20260916-live1';
const CACHE_PREFIX = "pyrate-dial-app-";
const CACHE_NAME = CACHE_PREFIX + BUILD;
const BASE = new URL('./', self.location.href);
const PAGE_URL = new URL("pyratedial-app.html", BASE);
const ASSETS = [
  "pyratedial-app.html",
  "pyratedial-app.css?v=20260916-live1",
  "pyratedial-app.js?v=20260916-live1",
  "pyratedial-stations.js?v=20260916-live1",
  "pyratedial-shared.js?v=20260916-live1",
  "pyratedial-live.js?v=20260916-live1",
  "pyratedial-live.css?v=20260916-live1",
  "pyratedial-app-manifest.webmanifest",
  "pyratedial-icon-192.png",
  "pyratedial-icon-512.png",
  "pyratedial-ship.png"
];
const ALLOWED_PATHS = new Set(ASSETS.map(path => new URL(path, BASE).pathname));

function keyFor(url) {
  // Only station-selection queries share the same document shell. Keep JS/CSS
  // build versions separate so offline fallback cannot mix different builds.
  if (url.pathname === PAGE_URL.pathname) return PAGE_URL.href;
  const key = new URL(url.pathname, BASE);
  if (url.searchParams.has('v')) key.searchParams.set('v', url.searchParams.get('v'));
  return key.href;
}
async function cacheResponse(request, response) {
  if (!response.ok || response.type === 'opaque') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(keyFor(new URL(request.url)), response.clone());
  } catch (_) { /* Storage failure must not block the network response. */ }
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // A missing optional icon must not prevent this safety update from installing.
    await Promise.all(ASSETS.map(async path => {
      const request = new Request(new URL(path, BASE).href, { cache: 'no-store' });
      try { await cacheResponse(request, await fetch(request)); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    if (self.registration.scope !== PAGE_URL.href) {
      // This script may be fetched by the old site's root-scoped registration.
      // Retire that registration instead of taking control of unrelated pages.
      await self.registration.unregister();
      return;
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !ALLOWED_PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request, { cache: 'no-store' });
      await cacheResponse(request, response);
      // Preserve real 404/403 responses; never disguise them as receiver HTML.
      return response;
    } catch (_) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(keyFor(url));
        if (cached) return cached;
      } catch (_) {}
      // Only the receiver's own document may fall back to its own shell.
      // If absent, a 503 is honest for every resource type.
      return new Response('Pyrate Dial needs a network connection for this file.', {
        status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
