import { db } from "./db"

/**
 * A key/value store on SQLite, shaped like AsyncStorage so TanStack's persister
 * can use it directly.
 *
 * AsyncStorage would be the obvious choice and is already a dependency, but it
 * is the wrong size class here: Android gives it a 6MB database by default and
 * reads through a cursor window, while twelve portal catalogues serialise to
 * roughly 9MB. SQLite has no such ceiling, and because the persister writes one
 * row per query rather than one blob for the whole cache, a single portal can
 * be read or replaced without touching the others.
 */
export const sqliteStorage = {
  async getItem(key: string) {
    const handle = await db
    const row = await handle.getFirstAsync<{ value: string }>(
      "SELECT value FROM cache WHERE key = ?",
      key,
    )
    return row?.value ?? null
  },

  async setItem(key: string, value: string) {
    const handle = await db
    await handle.runAsync(
      "INSERT OR REPLACE INTO cache (key, value) VALUES (?, ?)",
      key,
      value,
    )
  },

  async removeItem(key: string) {
    const handle = await db
    await handle.runAsync("DELETE FROM cache WHERE key = ?", key)
  },

  // Optional on the persister's interface, but it is what lets it garbage
  // collect entries whose queries no longer exist — without it, every re-synced
  // portal would leave its old catalogue behind forever.
  async entries(): Promise<Array<[string, string]>> {
    const handle = await db
    const rows = await handle.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM cache",
    )
    return rows.map((row) => [row.key, row.value])
  },
}
