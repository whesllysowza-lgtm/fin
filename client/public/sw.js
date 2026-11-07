const CACHE_NAME = "financas-wesly-v6";
const CACHE_PREFIX = "financas-wesly-";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/finance-icon.svg", "/icons/finance-wallet.svg", "/icons/finance-chart.svg", "/icons/finance-coin.svg", "/icons/finance-piggy.svg", "/icons/finance-wallet-192.png", "/icons/finance-wallet-512.png", "/icons/finance-chart-192.png", "/icons/finance-chart-512.png", "/icons/finance-coin-192.png", "/icons/finance-coin-512.png", "/icons/finance-piggy-192.png", "/icons/finance-piggy-512.png", "/manifests/finance-wallet.webmanifest", "/manifests/finance-chart.webmanifest", "/manifests/finance-coin.webmanifest", "/manifests/finance-piggy.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});
