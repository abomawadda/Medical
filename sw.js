const CACHE_NAME = "we-medical-v4-5b0c1c3565e27c63";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json?v=20261018-nabd",
  "./css/styles.css?v=20261018-profiles",
  "./js/config.js?v=20261017-live",
  "./css/fonts.css",
  "./js/storage.js",
  "./js/api.js?v=20261018-profiles",
  "./js/quality.js?v=20261018-nabd",
  "./js/contacts.js?v=20261018-nabd",
  "./js/directory-research.js?v=20261018-profiles",
  "./js/avatar-hints.js?v=20261018-profiles",
  "./js/app.js?v=20261018-profiles",
  "./img/we_logo.webp",
  "./img/nekaba-mark.png",
  "./img/provider-anime.png",
  "./img/favicon-32.png",
  "./img/icon-96.png",
  "./img/icon-192.png",
  "./img/icon-512.png",
];
const FONT_ASSETS = ["./img/fonts/3270f0cb47fdabc3.woff2","./img/fonts/40af6d88b63079a0.woff2","./img/fonts/481acf6760031cee.woff2","./img/fonts/6c9f4bab97d6bc5f.woff2","./img/fonts/6d3351fc535f8ef3.woff2","./img/fonts/8ab0af53a3bda9d3.woff2","./img/fonts/8f262393e9249e61.woff2","./img/fonts/9d1f41b13e519d90.woff2","./img/fonts/a005256cb957ecc7.woff2","./img/fonts/c69d345fa1068c2d.woff2","./img/fonts/e8fc56ad5aa556a1.woff2"];
PRECACHE.push(...FONT_ASSETS);
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
// Application assets stay coherent; public endpoint configuration refreshes online.
// APIs, credentials and third-party requests bypass the cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !assetUrls.has(event.request.url))
    return;
  if (new URL(event.request.url).pathname.endsWith("/js/config.js")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request, { cache: "no-store" });
        if (!response.ok) throw new Error("Configuration unavailable");
        await cache.put(event.request, response.clone());
        return response;
      } catch {
        return (await cache.match(event.request)) || Response.error();
      }
    })());
    return;
  }
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
