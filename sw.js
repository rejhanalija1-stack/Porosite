// Bump CACHE whenever the precached files change.
const CACHE = 'v5';
const PRECACHE = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
// Versioned third-party assets (Leaflet, Google Fonts) are safe to serve cache-first.
const CDN = ['https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
const NAV_TIMEOUT = 3500;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

function put(req, res) {
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (CDN.includes(url.origin)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) put(req, res);
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;

  // Same origin: network first. Fall back to the cache when offline, on server errors, or when
  // opening the app takes longer than NAV_TIMEOUT on a weak signal (the network still refreshes the cache).
  const fallback = () => caches.match(req, { ignoreSearch: true })
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
  const net = fetch(req).then(res => {
    if (res.status === 200 && res.type === 'basic') put(req, res);
    return res;
  });
  e.respondWith(new Promise(resolve => {
    let done = false;
    const finish = r => { if (r && !done) { done = true; resolve(r); } };
    const timer = req.mode === 'navigate' ? setTimeout(() => fallback().then(finish), NAV_TIMEOUT) : 0;
    net.then(
      res => { clearTimeout(timer); if (res.ok) finish(res); else fallback().then(hit => finish(hit || res)); },
      () => { clearTimeout(timer); fallback().then(hit => finish(hit || Response.error())); }
    );
  }));
  e.waitUntil(net.then(() => {}, () => {}));
});
