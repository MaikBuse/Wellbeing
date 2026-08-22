/*
 * Minimal service worker.
 *
 * Hard rule: cache only immutable public assets. Never cache HTML, RSC
 * payloads or /api/* — server-rendered pages contain one person's health data
 * and the phone may be a shared device.
 *
 * Bump CACHE when this file changes.
 */
// v2: the icon files were replaced with the real logo. The URLs did not
// change, and /icons/* is served cache-first, so without this bump an already
// installed PWA would keep the old placeholders indefinitely.
const CACHE = 'wb-static-v2';
const SHELL = [
  '/offline',
  '/icons/icon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // The offline page renders this one, so it has to survive going offline.
  '/icons/logo-256.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never touch auth or server actions.
  if (url.pathname.startsWith('/api/')) return;

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline').then((hit) => hit ?? Response.error())
      )
    );
  }
});
