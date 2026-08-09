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

      -- One row per logo, keyed by its URL. Deciding how a logo should be
      -- presented means decoding it, so the answer is kept once per logo ever
      -- rather than once per launch — a catalogue of tens of thousands would
      -- otherwise redo the work every time the list was scrolled.
      CREATE TABLE IF NOT EXISTS logo_style (
        url TEXT PRIMARY KEY NOT NULL,
        -- The decision as JSON. "Leave it alone" is a real answer and is stored
        -- like any other, so it is not reconsidered on every pass.
        style TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS epg_feed (
        key TEXT PRIMARY KEY NOT NULL,
        -- When the fetched window stops covering the clock. Past this the feed
        -- is refetched rather than shown with gaps.
        valid_to INTEGER NOT NULL
      );
    `)

    // The guide tables are a cache, so a shape change is thrown away rather
    // than migrated. Only these — the query cache alongside them is keyed by
    // its own buster and is not worth re-downloading for this.
    const row = await handle.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version",
    )

    const version = row?.user_version ?? 0

    // Colours are keyed by logo URL alone, so changing which swatch is stored
    // does not change the key — every logo already looked at would keep its old
    // answer forever. Emptying the table is the migration, and it is a DELETE
    // rather than a DROP because the table was created moments ago in the
    // statement above and dropping it here would leave nothing to write to.
    //
    // Bump this whenever the native pass changes what it decides, what it
    // reports, or what it writes to disk. The last of those is easy to miss: a
    // stored row points at a redrawn PNG by path, so raising the resolution
    // those are written at changes nothing until the rows naming the old files
    // are gone.
    if (version < 17) {
      await handle.execAsync("DELETE FROM logo_style;")
    }

    if (version < 2) {
      await handle.execAsync(`
        DROP TABLE IF EXISTS epg_slot;
        DROP TABLE IF EXISTS epg_feed;

        CREATE TABLE epg_slot (
          feed TEXT NOT NULL,
          xmltv_id TEXT NOT NULL,
          start_at INTEGER NOT NULL,
          stop_at INTEGER NOT NULL,
          title TEXT NOT NULL
        );
        CREATE INDEX epg_slot_lookup ON epg_slot (xmltv_id, stop_at);
        CREATE INDEX epg_slot_feed ON epg_slot (feed);

        CREATE TABLE epg_feed (
          key TEXT PRIMARY KEY NOT NULL,
          valid_to INTEGER NOT NULL,
          -- How many of the user's channels this feed was filtered against.
          -- A stored feed covers its window, so without this a channel that
          -- joined the catalogue afterwards -- a newly favourited one, a
          -- re-synced source, a portal switched back on -- found the feed
          -- already current and got no guide until the window ran out hours
          -- later.
          wanted_count INTEGER NOT NULL DEFAULT 0
        );
      `)
    }

    // Set once, outside the branches. Inside the version-2 block it would never
    // run for a database already at 2, so the colour table would be emptied on
    // every launch from then on.
    if (version < 17) {
      await handle.execAsync("PRAGMA user_version = 17;")
    }

    return handle
  },
)
