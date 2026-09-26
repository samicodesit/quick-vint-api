// Cache only the app shell. Authenticated API responses and private media stay online.
self.addEventListener("install", (event) => { event.waitUntil(caches.open("ops-shell-v1").then((cache) => cache.addAll(["/app/", "/app/phone"]))); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/app/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((response) => response || Response.error())));
});
