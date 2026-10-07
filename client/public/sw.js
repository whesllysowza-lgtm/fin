const CACHE_NAME = "financas-wesly-v5";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/finance-icon.svg", "/icons/finance-wallet.svg", "/icons/finance-chart.svg", "/icons/finance-coin.svg", "/icons/finance-piggy.svg", "/icons/finance-wallet-192.png", "/icons/finance-wallet-512.png", "/icons/finance-chart-192.png", "/icons/finance-chart-512.png", "/icons/finance-coin-192.png", "/icons/finance-coin-512.png", "/icons/finance-piggy-192.png", "/icons/finance-piggy-512.png", "/manifests/finance-wallet.webmanifest", "/manifests/finance-chart.webmanifest", "/manifests/finance-coin.webmanifest", "/manifests/finance-piggy.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});
