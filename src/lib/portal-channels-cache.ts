import type { PortalChannel } from "@/lib/stalker-types"

// Caches each saved source's channel list in IndexedDB, keyed by source id,
// so a normal page refresh doesn't re-download every enabled portal's full
// channel list from Postgres. Entries are invalidated by comparing the
// source's own `updatedAt` (set whenever it's re-synced/edited), not a TTL.

const DB_NAME = "portalhop"
const DB_VERSION = 1
const STORE_NAME = "portalChannels"

type CachedPortalChannels = {
  sourceId: number
  updatedAt: number
  channels: PortalChannel[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "sourceId" })
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
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  if (typeof indexedDB === "undefined") {
    return null
  }

  try {
    const db = await openDb()

    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, mode)
      const request = run(tx.objectStore(STORE_NAME))

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
  return withStore("readonly", (store) => store.get(sourceId))
}

export async function setCachedPortalChannels(
  entry: CachedPortalChannels
): Promise<void> {
  await withStore("readwrite", (store) => store.put(entry))
}

// Drops any cached entries for sources that no longer exist (deleted
// portals), so the cache doesn't grow unbounded over time.
export async function prunePortalChannelsCache(
  keepSourceIds: number[]
): Promise<void> {
  const keep = new Set(keepSourceIds)

  const allKeys = await withStore("readonly", (store) => store.getAllKeys())

  if (!allKeys) {
    return
  }

  const staleKeys = allKeys.filter(
    (key): key is number => typeof key === "number" && !keep.has(key)
  )

  if (!staleKeys.length) {
    return
  }

  await withStore("readwrite", (store) => {
    staleKeys.forEach((key) => store.delete(key))
    // The caller only awaits completion, not the deleted values, so any of
    // the delete requests can stand in as the tracked request.
    return store.delete(staleKeys[0])
  })
}
