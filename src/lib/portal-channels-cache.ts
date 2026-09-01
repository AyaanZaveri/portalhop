import type { PortalChannel } from "@portalhop/shared/stalker-types"

// Caches each saved source's channel list in IndexedDB, keyed by source id,
// so a normal page refresh doesn't re-download every enabled portal's full
// channel list from Postgres. Entries are invalidated by comparing the
// source's own `updatedAt` (set whenever it's re-synced/edited), not a TTL.

const DB_NAME = "portalhop"
// Version 4 refreshes saved catalogues whose provider logos are now replaced
// with their configured EPG logos before being cached.
// Version 5 adds the EPG now-playing store.
// Version 6 drops catalogues cached before the server resolved channel names.
// They hold the portal's own name, and nothing invalidates them: the entry is
// keyed on the source's updatedAt, which a change to the guide directory —
// or to this app — never moves. Left in place they are exactly the flash, a
// stale name painted on load and corrected on the next refetch.
// Version 7 drops catalogues cached before a channel's logo was told apart from
// its streams'. They carry one logoUrl and no sourceLogoUrl, so a row would
// wear whichever portal sorted first and the sources drawer would show that one
// mark on every line. Same trap as version 6 and dropped the same way.
// Version 8 adds a tiny, per-user favourite-row projection. It is deliberately
// separate from the catalogue cache: a person with fifteen favourites should
// not have to deserialize every enabled portal before seeing a useful list.
const DB_VERSION = 8
const STORE_NAME = "portalChannels"
const IPTV_ORG_STORE_NAME = "iptvOrgChannels"
const EPG_WINDOW_STORE_NAME = "epgWindows"
const FAVORITE_CHANNELS_STORE_NAME = "favoriteChannels"

export type CachedPortalChannels = {
  sourceId: number
  updatedAt: number
  channels: PortalChannel[]
}

export type CachedFavoriteChannel = PortalChannel & {
  /** The stored favourite membership this row represents. */
  favoriteKey: string
  source: {
    id: number
    name: string
    epgMode: "portal" | "iptv-org" | "custom" | "none"
    epgSourceId: number | null
  }
}

type CachedFavoriteChannels = {
  userId: string
  channels: CachedFavoriteChannel[]
}

type CachedIptvOrgChannels = {
  id: "catalogue"
  expiresAt: number
  channels: PortalChannel[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result
      // Versions through 6 stored incompatible catalogue shapes. Version 8
      // only adds the small favourite store, so preserve valid v7 catalogues
      // instead of making every returning user pay for a cold reload.
      if (event.oldVersion < 7 && db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "sourceId" })
      }
      if (!db.objectStoreNames.contains(IPTV_ORG_STORE_NAME)) {
        db.createObjectStore(IPTV_ORG_STORE_NAME, { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains(EPG_WINDOW_STORE_NAME)) {
        db.createObjectStore(EPG_WINDOW_STORE_NAME, { keyPath: "key" })
      }
      if (!db.objectStoreNames.contains(FAVORITE_CHANNELS_STORE_NAME)) {
        db.createObjectStore(FAVORITE_CHANNELS_STORE_NAME, { keyPath: "userId" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// IndexedDB can be unavailable (very old browsers) or throw (private
// browsing quota limits, disabled storage). This is a best-effort cache, so
// every entry point swallows failures and just falls back to a network
// fetch rather than surfacing an error to the user.
async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  if (typeof indexedDB === "undefined") {
    return null
  }

  try {
    const db = await openDb()

    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(storeName, mode)
      const request = run(tx.objectStore(storeName))

      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
      tx.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function getCachedPortalChannels(
  sourceId: number
): Promise<CachedPortalChannels | null> {
  return withStore(STORE_NAME, "readonly", (store) => store.get(sourceId))
}

/**
 * Reads several source catalogues through one IndexedDB transaction.
 *
 * A page reload commonly opens many enabled sources. Opening the database and
 * starting one transaction per source serializes that otherwise local work,
 * so callers that need a whole catalogue should use this instead of looping
 * over getCachedPortalChannels().
 */
export async function getCachedPortalChannelsBatch(
  sourceIds: number[],
): Promise<Map<number, CachedPortalChannels>> {
  if (typeof indexedDB === "undefined" || !sourceIds.length) {
    return new Map()
  }

  try {
    const db = await openDb()

    return await new Promise<Map<number, CachedPortalChannels>>((resolve) => {
      const cached = new Map<number, CachedPortalChannels>()
      const tx = db.transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)

      for (const sourceId of new Set(sourceIds)) {
        const request = store.get(sourceId)
        request.onsuccess = () => {
          const entry = request.result
          if (entry && typeof entry === "object") {
            cached.set(sourceId, entry as CachedPortalChannels)
          }
        }
      }

      // A transaction completes only after every get request has finished, so
      // this also avoids reporting a partial cache hit as a completed read.
      tx.oncomplete = () => resolve(cached)
      tx.onerror = () => resolve(new Map())
      tx.onabort = () => resolve(new Map())
    })
  } catch {
    return new Map()
  }
}

export async function setCachedPortalChannels(
  entry: CachedPortalChannels
): Promise<void> {
  await withStore(STORE_NAME, "readwrite", (store) => store.put(entry))
}

// Drops any cached entries for sources that no longer exist (deleted
// portals), so the cache doesn't grow unbounded over time.
export async function prunePortalChannelsCache(
  keepSourceIds: number[]
): Promise<void> {
  const keep = new Set(keepSourceIds)

  const allKeys = await withStore(STORE_NAME, "readonly", (store) => store.getAllKeys())

  if (!allKeys) {
    return
  }

  const staleKeys = allKeys.filter(
    (key): key is number => typeof key === "number" && !keep.has(key)
  )

  if (!staleKeys.length) {
    return
  }

  await withStore(STORE_NAME, "readwrite", (store) => {
    staleKeys.forEach((key) => store.delete(key))
    // The caller only awaits completion, not the deleted values, so any of
    // the delete requests can stand in as the tracked request.
    return store.delete(staleKeys[0])
  })
}

export async function getCachedIptvOrgChannels(): Promise<PortalChannel[] | null> {
  const cached = await withStore<CachedIptvOrgChannels>(
    IPTV_ORG_STORE_NAME,
    "readonly",
    (store) => store.get("catalogue"),
  )
  return cached && cached.expiresAt > Date.now() ? cached.channels : null
}

export async function setCachedIptvOrgChannels(
  channels: PortalChannel[],
  expiresAt: number,
): Promise<void> {
  await withStore(IPTV_ORG_STORE_NAME, "readwrite", (store) =>
    store.put({ id: "catalogue", expiresAt, channels }),
  )
}

/**
 * The cached rows are a display projection, not a second source of truth for
 * favourites. Membership still comes from /api/favorites and trims this list
 * after a background refresh.
 */
export async function getCachedFavoriteChannels(
  userId: string,
): Promise<CachedFavoriteChannel[] | null> {
  const cached = await withStore<CachedFavoriteChannels>(
    FAVORITE_CHANNELS_STORE_NAME,
    "readonly",
    (store) => store.get(userId),
  )
  return cached?.channels ?? null
}

export async function setCachedFavoriteChannels(
  userId: string,
  channels: CachedFavoriteChannel[],
): Promise<void> {
  await withStore(FAVORITE_CHANNELS_STORE_NAME, "readwrite", (store) =>
    store.put({ userId, channels }),
  )
}

type CachedEpgWindow = {
  key: string
  to: number
  channels: Record<string, [number, number, string, string?][]>
}

/** Null when nothing is cached or the window has already run out. */
export async function getCachedEpgWindow(
  key: string,
): Promise<CachedEpgWindow | null> {
  const entry = await withStore<CachedEpgWindow>(
    EPG_WINDOW_STORE_NAME,
    "readonly",
    (store) => store.get(key),
  )

  return entry && entry.to > Date.now() ? entry : null
}

export async function setCachedEpgWindow(entry: CachedEpgWindow): Promise<void> {
  await withStore(EPG_WINDOW_STORE_NAME, "readwrite", (store) =>
    store.put(entry),
  )
}
