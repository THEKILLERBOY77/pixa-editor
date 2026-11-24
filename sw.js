const VER = 'pixa-v2';
const SHELL = ['./', 'index.html', 'style.css', 'util.js', 'gl.js', 'beauty.js', 'effects.js', 'ai.js', 'collage.js', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const EXT = ['cdn.jsdelivr.net', 'storage.googleapis.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ext = EXT.includes(url.hostname);
  if (url.origin !== location.origin && !ext) return;
  // модели и библиотеки: кэш-первым; свои файлы: сеть-первой с откатом на кэш
  if (ext) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VER).then((c) => c.put(req, copy)); }
      return res;
    })));
  } else {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(VER).then((c) => c.put(req, copy)); return res;
    }).catch(() => caches.match(req)));
  }
});
