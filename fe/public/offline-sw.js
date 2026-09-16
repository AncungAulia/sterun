/*
  The service worker for the two screens that run with no signal: the runner's
  pass (/pass) and the volunteer's desk (/scan).

  One file, registered twice, each time with its own narrow scope. The worker
  reads which scope it was registered for and caches only that path plus the
  build's JavaScript and CSS, in a cache named for the scope. So the pass's
  worker never touches the desk and neither ever touches /events, /org or /,
  where a stale page could show a quota the chain no longer agrees with. That
  is why the scope is narrow rather than the origin.

  What it does: keeps the last successful response for those paths and serves
  that copy when the network fails. A venue has no signal, and a reload there
  must not end at the browser's offline page.

  Plain JavaScript, served as a file: a service worker is not part of the app's
  module graph and cannot be bundled with it.
*/
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const CACHE_PREFIX = "sterun-offline-";
const CACHE = `${CACHE_PREFIX}v1${SCOPE_PATH}`;

/**
 * Caches this worker may delete: its own older versions, and the pass's cache
 * from before the desk shared this file. Never the other scope's: deleting
 * them from here would empty the pass while the desk updates.
 */
function isStale(key) {
  if (key === CACHE) return false;
  if (SCOPE_PATH === "/pass" && key === "sterun-pass-v1") return true;
  return key.startsWith(CACHE_PREFIX) && key.endsWith(SCOPE_PATH);
}

self.addEventListener("install", () => {
  /*
    Nothing is precached. The build's asset names are hashed and unknown here,
    so the cache is filled by the fetch handler on the first online visit. That
    is the honest limit both screens state: they need signal once.
  */
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter(isStale).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  const inScope = url.pathname === SCOPE_PATH || url.pathname.startsWith(`${SCOPE_PATH}/`);
  return inScope || url.pathname.startsWith("/_next/");
}

self.addEventListener("fetch", (event) => {
  if (!cacheable(event.request)) return;

  /*
    Network first, cache as a fallback. The other way round would serve a build
    that has been replaced, and a screen showing an old build at a desk is harder
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
        const hit = await caches.match(event.request, { cacheName: CACHE });
        if (hit) return hit;
        // A page this phone has never opened: there is nothing honest to show,
        // so the browser reports the failure itself.
        return Response.error();
      }),
  );
});
