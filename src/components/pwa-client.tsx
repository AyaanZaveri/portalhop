"use client"

import { useEffect, useState } from "react"

import { isMobileApp } from "@/lib/build-target"

export function PwaClient() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const updateNetworkStatus = () => setIsOffline(!navigator.onLine)

    updateNetworkStatus()
    window.addEventListener("online", updateNetworkStatus)
    window.addEventListener("offline", updateNetworkStatus)

    /**
     * In development, tear down any worker that is still registered.
     *
     * Not registering one here was never enough. A service worker is scoped to
     * the origin, not to the build, so one registered by a production build
     * that was ever run on localhost keeps controlling the dev server on the
     * same port indefinitely.
     *
     * What that costs is specific: sw.js serves /_next/static/ cache-first,
     * which is safe in production because those paths are content-hashed, and
     * actively wrong under Turbopack, which reuses those paths across rebuilds.
     * The page navigates fine — navigations are network-first — and then runs
     * yesterday's JavaScript, so an edit appears to do nothing.
     *
     * The caches go too. Unregistering stops the worker controlling future
     * loads but leaves its stored responses behind, and the next production
     * build on this origin would adopt them.
     */
    if (process.env.NODE_ENV !== "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister()
      })
      if ("caches" in window) {
        void caches.keys().then((keys) => {
          for (const key of keys) {
            if (key.startsWith("portal-hop")) void caches.delete(key)
          }
        })
      }
    }

    // The packaged app already serves its assets from disk, so a service
    // worker adds nothing and would cache against the webview's internal
    // origin. The offline banner above still applies.
    if (
      !isMobileApp &&
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(async (registration) => {
          await navigator.serviceWorker.ready
          const urls = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => new URL(url).pathname.startsWith("/_next/static/"))

          ;(navigator.serviceWorker.controller ?? registration.active)?.postMessage({
            type: "CACHE_STATIC_ASSETS",
            urls,
          })
        })
        .catch(() => {
          // The app remains fully usable online if registration is unavailable.
        })
    }

    return () => {
      window.removeEventListener("online", updateNetworkStatus)
      window.removeEventListener("offline", updateNetworkStatus)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4"
    >
      <p className="bg-background/95 text-foreground rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md dark:bg-background/85">
        You’re offline. Reconnect to load channels.
      </p>
    </div>
  )
}
