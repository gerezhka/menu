/* Service worker: кешує додаток для роботи офлайн.
   Змінюйте версію CACHE при кожному оновленні файлів. */
const CACHE = 'meal-planner-v3';
const TAILWIND = 'https://cdn.tailwindcss.com/3.4.17';
const FILES = ['./', './index.html', './app.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES);
    // Tailwind з іншого домену: no-cors дає «непрозору» відповідь, яку все одно можна кешувати
    try { await cache.put(TAILWIND, await fetch(new Request(TAILWIND, { mode: 'no-cors' }))); } catch (err) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      if (res && (res.ok || res.type === 'opaque')) (await caches.open(CACHE)).put(e.request, res.clone());
      return res;
    } catch (err) {
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      throw err;
    }
  })());
});
