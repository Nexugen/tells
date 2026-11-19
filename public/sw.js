// tells service worker: keeps the page shell for offline start. Checking and fixing need the network.
const CACHE = 'tells-shell-v1';
const SHELL = ['/', '/developers', '/privacy', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/v1') || url.pathname === '/mcp') return;
  if (req.mode === 'navigate') {
    // Network first, so a new version shows at once; the saved shell when offline.
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && SHELL.includes(url.pathname)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); }
      return res;
    }).catch(() => caches.match(url.pathname).then((hit) => hit || caches.match('/'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
