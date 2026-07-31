"use client"

import { useEffect, useState } from "react"

export function PwaClient() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const updateNetworkStatus = () => setIsOffline(!navigator.onLine)

    updateNetworkStatus()
    window.addEventListener("online", updateNetworkStatus)
    window.addEventListener("offline", updateNetworkStatus)

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
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
      className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] flex justify-center px-4"
    >
      <p className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg">
        You’re offline. Reconnect to load channels.
      </p>
    </div>
  )
}
