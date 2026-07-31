const CACHE_NAME = "portal-hop-shell-v1"
const APP_SHELL = [
  "/tv",
  "/favicon.ico",
  "/favicon.svg",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("portal-hop-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function cacheResponse(request, response) {
  if (!response || !response.ok) return response

  const copy = response.clone()
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
  return response
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== "GET" || url.origin !== self.location.origin) return

  // Playlist, EPG, and stream requests stay network-only: they may be private
  // or stale, and an offline shell is more useful than misleading playback data.
  if (url.pathname.startsWith("/api/")) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (url.pathname === "/tv") {
            cacheResponse("/tv", response.clone())
          }
          return response
        })
        .catch(async () => {
          const shell = await caches.match("/tv")
          return shell || Response.error()
        }),
    )
    return
  }

  // Next's static files are content-hashed, making cache-first safe and fast.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then(
        (response) => cacheResponse(request, response),
      )),
    )
  }
})

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_STATIC_ASSETS") return

  const urls = Array.isArray(event.data.urls) ? event.data.urls : []
  const requests = urls
    .filter((value) => typeof value === "string")
    .map((value) => new URL(value, self.location.origin))
    .filter(
      (url) =>
        url.origin === self.location.origin &&
        url.pathname.startsWith("/_next/static/"),
    )

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(requests)),
  )
})
