// Favorites are stored per-user on the server (see /api/favorites). This module
// is a small client-side cache with optimistic updates so the UI stays snappy.
// Any favorites a device saved before sign-in (the legacy localStorage list) are
// migrated into the account once, the first time that user loads them.

const legacyStorageKey = "portalhop-favorite-channels"

type Listener = (favorites: Set<string>) => void

let cache = new Set<string>()
const listeners = new Set<Listener>()
let loadedUserId: string | null = null
let inFlight: Promise<void> | null = null

function notify() {
  for (const listener of listeners) {
    listener(cache)
  }
}

function setCache(next: Set<string>) {
  cache = next
  notify()
}

export function getFavorites(): Set<string> {
  return cache
}

export function subscribeToFavorites(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function readLegacyLocal(): string[] {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const stored = localStorage.getItem(legacyStorageKey)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** Loads the signed-in user's favorites, migrating any local ones first. */
export async function loadFavoritesForUser(userId: string): Promise<void> {
  if (loadedUserId === userId) {
    return
  }

  // Switching accounts (or first load): don't show the previous user's set.
  if (loadedUserId !== null) {
    setCache(new Set())
  }

  if (inFlight) {
    return inFlight
  }

  inFlight = (async () => {
    try {
      const local = readLegacyLocal()

      if (local.length) {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelKeys: local }),
        }).catch(() => {})
      }

      const res = await fetch("/api/favorites", { cache: "no-store" })

      if (res.ok) {
        const data = await res.json().catch(() => ({ favorites: [] }))
        const keys = Array.isArray(data.favorites)
          ? (data.favorites as unknown[]).map(String)
          : []
        setCache(new Set(keys))
        loadedUserId = userId

        if (local.length && typeof window !== "undefined") {
          try {
            localStorage.removeItem(legacyStorageKey)
          } catch {}
        }
      }
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Clears the in-memory cache, e.g. after sign-out. */
export function clearFavorites() {
  loadedUserId = null
  setCache(new Set())
}

/** Optimistically toggles a favorite and persists it. Throws on failure. */
export async function toggleFavorite(channelKey: string): Promise<void> {
  const wasFavorite = cache.has(channelKey)
  const next = new Set(cache)

  if (wasFavorite) {
    next.delete(channelKey)
  } else {
    next.add(channelKey)
  }

  setCache(next)

  try {
    const res = wasFavorite
      ? await fetch(
          `/api/favorites?channelKey=${encodeURIComponent(channelKey)}`,
          { method: "DELETE" }
        )
      : await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelKey }),
        })

    if (!res.ok) {
      throw new Error("Request failed")
    }
  } catch (error) {
    // Revert the optimistic change.
    const reverted = new Set(cache)
    if (wasFavorite) {
      reverted.add(channelKey)
    } else {
      reverted.delete(channelKey)
    }
    setCache(reverted)
    throw error
  }
}
