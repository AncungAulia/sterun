/*
  The pass's service worker. Scope: /pass, and nothing else.

  What it does: keeps the last successful response for what the pass needs (its
  own page and the build's JavaScript and CSS) and serves that copy when the
  network fails. A venue has no signal, and a reload there must not end at the
  browser's offline page.

  What it deliberately does not do: cache anything under /events, /org or /, so
  a stale race page can never be served as though it were the chain's answer.
  That is why the scope is narrow rather than the origin.

  Plain JavaScript, served as a file: a service worker is not part of the app's
  module graph and cannot be bundled with it.
*/
const CACHE = "sterun-pass-v1";

self.addEventListener("install", () => {
  /*
    Nothing is precached. The build's asset names are hashed and unknown here,
    so the cache is filled by the fetch handler on the first online visit. That
    is the honest limit the pass states on screen: it needs signal once.
  */
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return url.pathname.startsWith("/pass") || url.pathname.startsWith("/_next/");
}

self.addEventListener("fetch", (event) => {
  if (!cacheable(event.request)) return;

  /*
    Network first, cache as a fallback. The other way round would serve a build
    that has been replaced, and a pass showing an old build at a desk is harder
    to explain than a slow one.
  */
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(event.request);
        if (hit) return hit;
        // A pass this phone has never opened: there is nothing honest to show,
        // so the browser reports the failure itself.
        return Response.error();
      }),
  );
});
