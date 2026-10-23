const CACHE_NAME = "we-medical-v4-d09d529380792cb2";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json?v=20261023-device",
  "./css/styles.css?v=20261023-device",
  "./js/config.js?v=20261017-live",
  "./css/fonts.css",
  "./js/storage.js",
  "./js/admin-idle.js?v=20261023-device",
  "./js/content-policy.js?v=20261023-device",
  "./js/api.js?v=20261023-device",
  "./js/quality.js?v=20261018-nabd",
  "./js/contacts.js?v=20261018-nabd",
  "./js/directory-research.js?v=20261018-compact",
  "./js/avatar-hints.js?v=20261018-compact",
  "./js/search.js?v=20261018-search",
  "./js/names.js?v=20261018-batchdata",
  "./js/arabic-directory.js?v=20261018-batchdata",
  "./js/review-criteria.js?v=20261018-batchdata",
  "./js/locations.js?v=20261018-batchdata",
  "./js/facility-directory.js?v=20261018-batchdata",
  "./js/recommendations.js?v=20261023-device",
  "./js/install.js?v=20261023-device",
  "./js/member-summary.js?v=20261023-device",
  "./js/member-profile.js?v=20261023-device",
  "./js/release.js?v=20261023-device",
  "./js/device-preferences.js?v=20261023-device",
  "./js/directory-preview-model.js?v=20261023-device",
  "./js/visit-workspace.js?v=20261023-device",
  "./js/directory-preview.js?v=20261023-device",
  "./js/care-model.js?v=20261023-device",
  "./js/service-workflow.js?v=20261023-device",
  "./js/service-workspace.js?v=20261023-device",
  "./js/catalog-staging.js?v=20261023-device",
  "./js/directory-file.js?v=20261023-device",
  "./js/catalog-staging-workspace.js?v=20261023-device",
  "./js/admin-inbox.js?v=20261023-device",
  "./js/review-insights.js?v=20261023-device",
  "./js/lab-readiness.js?v=20261023-device",
  "./js/roadmap-workspace.js?v=20261023-device",
  "./js/development-lab.js?v=20261023-device",
  "./js/app.js?v=20261023-device",
  "./img/we_logo.webp",
  "./img/nekaba-mark-512.webp",
  "./img/provider-anime.webp",
  "./img/rayati-icon-512.webp",
  "./img/rayati-icon-192.png",
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
