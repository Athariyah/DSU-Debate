/* =========================================================================
 * DSU Debate — service worker для режима «как приложение» (PWA).
 *
 * Стратегия:
 *  - App shell (навигации: /, /home, /debates, ...) — network-first с
 *    откатом на кэш: офлайн открывается последняя собранная оболочка
 *    (весь фронтенд инлайнится в один index.html — vite-plugin-singlefile).
 *  - Статика (иконки, manifest, шрифты Google) — cache-first.
 *  - /api и /socket.io — никогда не кэшируем: голосование всегда живое.
 * ========================================================================= */

const CACHE_NAME = "dsu-debate-shell-v3"; // v3: без белых рамок, поддержка maskable иконок
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-maskable-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Живые данные — только через сеть.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/socket.io")) return;

  // Навигация: сеть сначала (свежая версия), кэш — офлайн-откат.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error()))
    );
    return;
  }

  // Остальная статика: кэш сначала, сеть — пополнить.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && (url.pathname.startsWith("/icon") || url.pathname.startsWith("/manifest"))) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
