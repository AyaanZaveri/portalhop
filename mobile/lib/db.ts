import * as SQLite from "expo-sqlite"

/**
 * The app's one SQLite database, opened once and shared.
 *
 * Two things live here: the persisted query cache, and the programme guide.
 * They are unrelated but neither wants its own connection — a second handle on
 * the same file is a second write lock to contend with, and the guide is
 * written in bulk while the list is reading from the cache.
 */
export const db = SQLite.openDatabaseAsync("portalhop-cache.db").then(
  async (handle) => {
    await handle.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      -- One row per programme, rather than one blob per feed. A feed is 2.4MB
      -- and 46,000 slots; the list needs the fifteen currently on screen, and
      -- this is what lets it ask for exactly those.
      CREATE TABLE IF NOT EXISTS epg_slot (
        feed TEXT NOT NULL,
        xmltv_id TEXT NOT NULL,
        start_at INTEGER NOT NULL,
        stop_at INTEGER NOT NULL,
        title TEXT NOT NULL
      );

      -- Covers both reads: what is on now for a channel, and the whole
      -- schedule for one. stop_at is second so a range scan on it stays
      -- within a single channel's rows.
      CREATE INDEX IF NOT EXISTS epg_slot_lookup
        ON epg_slot (xmltv_id, stop_at);

      -- Lets a stale feed be replaced by feed name without a table scan.
      CREATE INDEX IF NOT EXISTS epg_slot_feed ON epg_slot (feed);

      CREATE TABLE IF NOT EXISTS epg_feed (
        key TEXT PRIMARY KEY NOT NULL,
        -- When the fetched window stops covering the clock. Past this the feed
        -- is refetched rather than shown with gaps.
        valid_to INTEGER NOT NULL
      );
    `)
    return handle
  },
)
