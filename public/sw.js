// PawFeed service worker: network-first for the app shell so new deploys show up,
// falls back to the cache when the phone is offline. Device API calls are never cached.
const CACHE = 'pawfeed-v1';
const ASSETS = [
  '/', '/index.html', '/device-core.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const skip = url.pathname.startsWith('/api/') || url.pathname.startsWith('/report/');
  if (event.request.method !== 'GET' || url.origin !== location.origin || skip) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match('/index.html'))),
  );
});
