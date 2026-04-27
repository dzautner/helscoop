const CACHE_NAME = "helscoop-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .catch(() => undefined)
  );
  self.clients.claim();
});

function fallbackResponse(request) {
  return caches
    .match(request)
    .then((cached) => cached || caches.match("/"))
    .then((cached) => cached || Response.error());
}

function fetchAndRefreshCache(request) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, response.clone()))
          .catch(() => undefined);
      }
      return response;
    })
    .catch(() => fallbackResponse(request));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.match(/\.(js|css|woff2?|svg|png|jpg|ico)$/)) {
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache.match(request).then((cached) => {
            const refreshed = fetchAndRefreshCache(request);
            return cached || refreshed;
          })
        )
        .catch(() => fetchAndRefreshCache(request))
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => fallbackResponse(request))
  );
});
