import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import fs from "node:fs"
import path from "node:path"

import * as schema from "@/db/schema"

const dataDir = path.join(process.cwd(), "data")
const dbPath = path.join(dataDir, "portal-hop.sqlite")

let sqlite: Database.Database | null = null

function getSqlite() {
  if (sqlite) {
    return sqlite
  }

  fs.mkdirSync(dataDir, { recursive: true })
  sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS saved_portals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      portal_url TEXT NOT NULL,
      mac TEXT NOT NULL,
      serial TEXT,
      device_id TEXT,
      device_id_2 TEXT,
      signature TEXT,
      timezone TEXT NOT NULL,
      stb_type TEXT NOT NULL,
      endpoint TEXT,
      channel_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portal_id INTEGER NOT NULL REFERENCES saved_portals(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      xmltv_id TEXT NOT NULL DEFAULT '',
      number TEXT NOT NULL,
      name TEXT NOT NULL,
      genre_id TEXT NOT NULL,
      genre TEXT NOT NULL,
      cmd TEXT NOT NULL,
      logo TEXT NOT NULL,
      logo_url TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS saved_channels_portal_id_idx
      ON saved_channels(portal_id);
  `)
  const savedChannelColumns = sqlite
    .prepare("PRAGMA table_info(saved_channels)")
    .all() as Array<{ name: string }>

  if (!savedChannelColumns.some((column) => column.name === "xmltv_id")) {
    sqlite.exec("ALTER TABLE saved_channels ADD COLUMN xmltv_id TEXT NOT NULL DEFAULT ''")
  }

  return sqlite
}

export function getDb() {
  return drizzle(getSqlite(), { schema })
}

export { dbPath }
