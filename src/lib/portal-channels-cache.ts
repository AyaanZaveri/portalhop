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
const DB_VERSION = 7
const STORE_NAME = "portalChannels"
const IPTV_ORG_STORE_NAME = "iptvOrgChannels"
const EPG_WINDOW_STORE_NAME = "epgWindows"

type CachedPortalChannels = {
  sourceId: number
  updatedAt: number
  channels: PortalChannel[]
}

type CachedIptvOrgChannels = {
  id: "catalogue"
  expiresAt: number
  channels: PortalChannel[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (db.objectStoreNames.contains(STORE_NAME)) db.deleteObjectStore(STORE_NAME)
      db.createObjectStore(STORE_NAME, { keyPath: "sourceId" })
      if (!db.objectStoreNames.contains(IPTV_ORG_STORE_NAME)) {
        db.createObjectStore(IPTV_ORG_STORE_NAME, { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains(EPG_WINDOW_STORE_NAME)) {
        db.createObjectStore(EPG_WINDOW_STORE_NAME, { keyPath: "key" })
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

type CachedEpgWindow = {
  key: string
  to: number
  channels: Record<string, [number, number, string][]>
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
