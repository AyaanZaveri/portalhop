// Favorites are stored per-user on the server (see /api/favorites). This module
// is a small client-side cache with optimistic updates so the UI stays snappy.
// Any favorites a device saved before sign-in (the legacy localStorage list) are
// migrated into the account once, the first time that user loads them.

import { apiFetch } from "@/lib/api-fetch"
import {
  getCachedFavoriteChannels,
  setCachedFavoriteChannels,
  type CachedFavoriteChannel,
} from "@/lib/portal-channels-cache"

const legacyStorageKey = "portalhop-favorite-channels"

type Listener = (favorites: Set<string>) => void

let cache = new Set<string>()
let channelCache: CachedFavoriteChannel[] = []
let loading = true
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
  // A server refresh is authoritative for membership. Keep a stale card only
  // while it still represents one of those memberships, and place the cards
  // in the same insertion order as the server's manually ordered key list.
  const cardsByKey = new Map<string, CachedFavoriteChannel>()
  for (const channel of channelCache) {
    if (!cardsByKey.has(channel.favoriteKey)) {
      cardsByKey.set(channel.favoriteKey, channel)
    }
  }
  channelCache = [...next].flatMap((key) => {
    const channel = cardsByKey.get(key)
    return channel ? [channel] : []
  })
  notify()
}

function setLoading(next: boolean) {
  if (loading === next) return
  loading = next
  notify()
}

export function getFavorites(): Set<string> {
  return cache
}

/** Small renderable subset of the catalogue, available before portals load. */
export function getFavoriteChannels(): CachedFavoriteChannel[] {
  return channelCache
}

export function getFavoritesLoading(): boolean {
  return loading
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
    channelCache = []
    setCache(new Set())
  }

  if (inFlight) {
    return inFlight
  }

  setLoading(true)

  inFlight = (async () => {
    try {
      const local = readLegacyLocal()

      // IndexedDB is the fast path. It contains the last known renderable rows
      // as well as their keys, so the Favorites tab can paint while the network
      // request below verifies the account's current membership.
      const persisted = await getCachedFavoriteChannels(userId)
      if (persisted?.length) {
        channelCache = persisted
        setCache(new Set(persisted.map((channel) => channel.favoriteKey)))
        // A usable stale projection is better than a blank state. Membership
        // still refreshes below and can remove cards that changed elsewhere.
        setLoading(false)
      }

      if (local.length) {
        await apiFetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelKeys: local }),
        }).catch(() => {})
      }

      const res = await apiFetch("/api/favorites", { cache: "no-store" })

      if (res.ok) {
        const data = await res.json().catch(() => ({ favorites: [] }))
        const keys = Array.isArray(data.favorites)
          ? (data.favorites as unknown[]).map(String)
          : []
        setCache(new Set(keys))
        // Correct snapshots created by the first projection release, which
        // were accidentally written in catalogue order, as soon as the
        // authoritative favourite order arrives.
        void setCachedFavoriteChannels(userId, channelCache)
        loadedUserId = userId

        if (local.length && typeof window !== "undefined") {
          try {
            localStorage.removeItem(legacyStorageKey)
          } catch {}
        }
      }
    } finally {
      setLoading(false)
      inFlight = null
    }
  })()

  return inFlight
}

/** Clears the in-memory cache, e.g. after sign-out. */
export function clearFavorites() {
  loadedUserId = null
  channelCache = []
  setCache(new Set())
  setLoading(true)
}

/** Loads this device's local (signed-out) favorites from localStorage. */
export function loadLocalFavorites() {
  loadedUserId = null
  channelCache = []
  setCache(new Set(readLegacyLocal()))
  setLoading(false)
}

/**
 * Replaces the persisted display projection after the real catalogue loads.
 * This never changes the membership set; it only makes the next cold start
 * capable of drawing those rows before the catalogue is ready.
 */
export function cacheFavoriteChannels(
  userId: string,
  channels: CachedFavoriteChannel[],
) {
  // `cache` is a Set specifically because insertion order is the user's saved
  // manual favorite order. The catalogue scan that produced `channels` has a
  // different, provider-defined order, so never persist it directly.
  const cardsByKey = new Map<string, CachedFavoriteChannel>()
  for (const channel of channels) {
    if (!cardsByKey.has(channel.favoriteKey)) {
      cardsByKey.set(channel.favoriteKey, channel)
    }
  }
  const next = [...cache].flatMap((key) => {
    const channel = cardsByKey.get(key)
    return channel ? [channel] : []
  })
  channelCache = next
  void setCachedFavoriteChannels(userId, next)
}

/** Toggles a favorite for signed-out users, persisting to localStorage only. */
export function toggleFavoriteLocal(channelKey: string) {
  const next = new Set(cache)

  if (next.has(channelKey)) {
    next.delete(channelKey)
  } else {
    next.add(channelKey)
  }

  setCache(next)

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(legacyStorageKey, JSON.stringify([...next]))
    } catch {}
  }
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
      ? await apiFetch(
          `/api/favorites?channelKey=${encodeURIComponent(channelKey)}`,
          { method: "DELETE" }
        )
      : await apiFetch("/api/favorites", {
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

/**
 * Replaces legacy channel keys with their current equivalents. A legacy key
 * identified an M3U stream by its XMLTV id, which can describe more than one
 * playlist entry. Keeping this here preserves existing server and local
 * favorites when the client upgrades its channel identity format.
 */
export async function migrateFavoriteKeys(mappings: Map<string, string[]>) {
  const oldKeys = [...mappings.keys()].filter((key) => cache.has(key))
  if (!oldKeys.length) return

  const next = new Set(cache)
  const newKeys = oldKeys.flatMap((key) => mappings.get(key) ?? [])
  for (const key of oldKeys) next.delete(key)
  for (const key of newKeys) next.add(key)
  setCache(next)

  if (!loadedUserId) {
    if (typeof window !== "undefined") {
      try { localStorage.setItem(legacyStorageKey, JSON.stringify([...next])) } catch {}
    }
    return
  }

  try {
    if (newKeys.length) {
      await apiFetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelKeys: newKeys }),
      })
    }
    await Promise.all(oldKeys.map((key) => apiFetch(`/api/favorites?channelKey=${encodeURIComponent(key)}`, { method: "DELETE" })))
  } catch {
    // Keep the migrated in-memory state. A later sync can retry the server
    // update, and showing a favorite is preferable to silently losing it.
  }
}

/**
 * Reorders the cached favourites to match a saved sequence. The cache is a Set,
 * whose iteration order is what the UI renders, so rebuilding it in the new
 * order is the reorder. Keys not in the sequence keep their existing relative
 * order at the end — the sequence is only ever the visible subset, since the
 * list can be filtered by source or hidden category.
 */
export function reorderFavoritesLocal(channelKeys: string[]): void {
  const current = cache
  const desired = channelKeys.filter((key) => current.has(key))

  if (!desired.length) {
    return
  }

  const moved = new Set(desired)
  const next = new Set<string>(desired)

  for (const key of current) {
    if (!moved.has(key)) {
      next.add(key)
    }
  }

  setCache(next)
}
