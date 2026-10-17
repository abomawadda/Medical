const CACHE_NAME = "we-medical-v4-d0594386aaf1884a";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/config.js",
  "./js/data.js",
  "./js/storage.js",
  "./js/api.js",
  "./js/app.js",
  "./img/we_logo.webp",
  "./img/nekaba_logo.png",
  "./img/favicon-32.png",
  "./img/icon-96.png",
  "./img/icon-192.png",
  "./img/icon-512.png",
];
const assetUrls = new Set(PRECACHE.map((p) => new URL(p, self.location).href));
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (n) =>
                (n.startsWith("we-medical-v4-") ||
                  n.startsWith("we-medical-dakahlia-")) &&
                n !== CACHE_NAME,
            )
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
// One coherent precached release. APIs, credentials and third-party requests bypass the cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !assetUrls.has(event.request.url))
    return;
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then(
        async (cache) =>
          (await cache.match(event.request)) || fetch(event.request),
      ),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.action === "activate-update") self.skipWaiting();
});
