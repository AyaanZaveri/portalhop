import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import pg from "pg"

const { Pool } = pg

const rootDir = process.cwd()
const sqlitePath = path.join(rootDir, "data", "portal-hop.sqlite")
const databaseUrl = readEnv("DATABASE_URL")

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.")
}

if (!fs.existsSync(sqlitePath)) {
  throw new Error(`SQLite database not found at ${sqlitePath}`)
}

const sqlite = new Database(sqlitePath, { readonly: true })
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

try {
  await createSchema()
  await migrateData()
  await verifyData()
} finally {
  sqlite.close()
  await pool.end()
}

async function createSchema() {
  await pool.query(`
    create table if not exists "user" (
      id text primary key,
      name text not null,
      email text not null unique,
      email_verified boolean not null,
      image text,
      created_at timestamp not null,
      updated_at timestamp not null
    );

    create table if not exists session (
      id text primary key,
      expires_at timestamp not null,
      token text not null unique,
      created_at timestamp not null,
      updated_at timestamp not null,
      ip_address text,
      user_agent text,
      user_id text not null references "user"(id) on delete cascade
    );

    create table if not exists account (
      id text primary key,
      account_id text not null,
      provider_id text not null,
      user_id text not null references "user"(id) on delete cascade,
      access_token text,
      refresh_token text,
      id_token text,
      access_token_expires_at timestamp,
      refresh_token_expires_at timestamp,
      scope text,
      password text,
      created_at timestamp not null,
      updated_at timestamp not null
    );

    create table if not exists verification (
      id text primary key,
      identifier text not null,
      value text not null,
      expires_at timestamp not null,
      created_at timestamp,
      updated_at timestamp
    );

    create table if not exists saved_portals (
      id serial primary key,
      name text not null,
      portal_url text not null,
      mac text not null,
      serial text,
      device_id text,
      device_id_2 text,
      signature text,
      timezone text not null,
      stb_type text not null,
      endpoint text,
      channel_count integer not null default 0,
      created_at timestamp not null,
      updated_at timestamp not null
    );

    create table if not exists saved_sources (
      id serial primary key,
      name text not null,
      source_type text not null check (source_type in ('stalker', 'xtream', 'm3u')),
      channel_count integer not null default 0,
      created_at timestamp not null,
      updated_at timestamp not null
    );

    create table if not exists user_epg_sources (
      id serial primary key,
      user_id text not null references "user"(id) on delete cascade,
      name text not null,
      url text not null,
      channel_count integer not null default 0,
      refreshed_at timestamp,
      created_at timestamp not null,
      updated_at timestamp not null
    );
    create table if not exists user_epg_channels (
      epg_source_id integer not null references user_epg_sources(id) on delete cascade,
      channel_id text not null,
      name text not null,
      logo_url text,
      channel_id_lower text not null,
      name_normalized text not null,
      primary key (epg_source_id, channel_id)
    );
    alter table saved_sources add column if not exists epg_mode text not null default 'portal';
    alter table saved_sources add column if not exists epg_source_id integer references user_epg_sources(id) on delete set null;

    create table if not exists saved_stalker_sources (
      source_id integer primary key references saved_sources(id) on delete cascade,
      portal_url text not null,
      mac text not null,
      serial text,
      device_id text,
      device_id_2 text,
      signature text,
      timezone text not null,
      stb_type text not null,
      endpoint text
    );

    create table if not exists saved_xtream_sources (
      source_id integer primary key references saved_sources(id) on delete cascade,
      server_url text not null,
      username text not null,
      password text not null,
      output_format text not null
    );

    create table if not exists saved_m3u_sources (
      source_id integer primary key references saved_sources(id) on delete cascade,
      playlist_url text not null,
      derived_xtream_server_url text,
      derived_xtream_username text,
      derived_xtream_password text
    );

    create table if not exists saved_channels (
      id serial primary key,
      source_id integer not null references saved_sources(id) on delete cascade,
      portal_id integer references saved_portals(id) on delete cascade,
      identity_key text not null,
      channel_id text not null,
      xmltv_id text not null default '',
      number text not null,
      name text not null,
      genre_id text not null,
      genre text not null,
      cmd text not null,
      logo text not null,
      logo_url text not null,
      created_at timestamp not null,
      updated_at timestamp not null
    );

    create index if not exists session_user_id_idx on session(user_id);
    create index if not exists account_user_id_idx on account(user_id);
    create index if not exists account_provider_account_idx on account(provider_id, account_id);
    create index if not exists saved_channels_portal_id_idx on saved_channels(portal_id);
    create index if not exists saved_channels_source_id_idx on saved_channels(source_id);
    create unique index if not exists saved_channels_source_identity_key_idx on saved_channels(source_id, identity_key);
    create index if not exists saved_sources_updated_at_idx on saved_sources(updated_at);
    create index if not exists user_epg_sources_user_id_idx on user_epg_sources(user_id);
    create index if not exists user_epg_channels_channel_id_lower_idx on user_epg_channels(channel_id_lower);
    create index if not exists user_epg_channels_name_normalized_idx on user_epg_channels(name_normalized);

    alter table "user" enable row level security;
    alter table session enable row level security;
    alter table account enable row level security;
    alter table verification enable row level security;
    alter table saved_portals enable row level security;
    alter table saved_sources enable row level security;
    alter table saved_stalker_sources enable row level security;
    alter table saved_xtream_sources enable row level security;
    alter table saved_m3u_sources enable row level security;
    alter table saved_channels enable row level security;
  `)
}

async function migrateData() {
  const client = await pool.connect()

  try {
    await client.query("begin")
    await client.query(`
      truncate table
        saved_channels,
        saved_m3u_sources,
        saved_xtream_sources,
        saved_stalker_sources,
        saved_sources,
        saved_portals,
        verification,
        account,
        session,
        "user"
      restart identity cascade
    `)

    await insertRows(client, `"user"`, [
      "id",
      "name",
      "email",
      "email_verified",
      "image",
      "created_at",
      "updated_at",
    ], readRows("user").map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      email_verified: Boolean(row.email_verified),
      image: row.image,
      created_at: toDate(row.created_at),
      updated_at: toDate(row.updated_at),
    })))

    await insertRows(client, "saved_portals", [
      "id",
      "name",
      "portal_url",
      "mac",
      "serial",
      "device_id",
      "device_id_2",
      "signature",
      "timezone",
      "stb_type",
      "endpoint",
      "channel_count",
      "created_at",
      "updated_at",
    ], readRows("saved_portals").map((row) => ({
      id: row.id,
      name: row.name,
      portal_url: row.portal_url,
      mac: row.mac,
      serial: row.serial,
      device_id: row.device_id,
      device_id_2: row.device_id_2,
      signature: row.signature,
      timezone: row.timezone,
      stb_type: row.stb_type,
      endpoint: row.endpoint,
      channel_count: row.channel_count,
      created_at: toDate(row.created_at),
      updated_at: toDate(row.updated_at),
    })))

    await insertRows(client, "saved_sources", [
      "id",
      "name",
      "source_type",
      "channel_count",
      "created_at",
      "updated_at",
    ], readRows("saved_portals").map((row) => ({
      id: row.id,
      name: row.name,
      source_type: "stalker",
      channel_count: row.channel_count,
      created_at: toDate(row.created_at),
      updated_at: toDate(row.updated_at),
    })))

    await insertRows(client, "saved_stalker_sources", [
      "source_id",
      "portal_url",
      "mac",
      "serial",
      "device_id",
      "device_id_2",
      "signature",
      "timezone",
      "stb_type",
      "endpoint",
    ], readRows("saved_portals").map((row) => ({
      source_id: row.id,
      portal_url: row.portal_url,
      mac: row.mac,
      serial: row.serial,
      device_id: row.device_id,
      device_id_2: row.device_id_2,
      signature: row.signature,
      timezone: row.timezone,
      stb_type: row.stb_type,
      endpoint: row.endpoint,
    })))

    await insertRows(client, "session", [
      "id",
      "expires_at",
      "token",
      "created_at",
      "updated_at",
      "ip_address",
      "user_agent",
      "user_id",
    ], readRows("session").map((row) => ({
      id: row.id,
      expires_at: toDate(row.expires_at),
      token: row.token,
      created_at: toDate(row.created_at),
      updated_at: toDate(row.updated_at),
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      user_id: row.user_id,
    })))

    await insertRows(client, "account", [
      "id",
      "account_id",
      "provider_id",
      "user_id",
      "access_token",
      "refresh_token",
      "id_token",
      "access_token_expires_at",
      "refresh_token_expires_at",
      "scope",
      "password",
      "created_at",
      "updated_at",
    ], readRows("account").map((row) => ({
      id: row.id,
      account_id: row.account_id,
      provider_id: row.provider_id,
      user_id: row.user_id,
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      id_token: row.id_token,
      access_token_expires_at: toNullableDate(row.access_token_expires_at),
      refresh_token_expires_at: toNullableDate(row.refresh_token_expires_at),
      scope: row.scope,
      password: row.password,
      created_at: toDate(row.created_at),
      updated_at: toDate(row.updated_at),
    })))

    await insertRows(client, "verification", [
      "id",
      "identifier",
      "value",
      "expires_at",
      "created_at",
      "updated_at",
    ], readRows("verification").map((row) => ({
      id: row.id,
      identifier: row.identifier,
      value: row.value,
      expires_at: toDate(row.expires_at),
      created_at: toNullableDate(row.created_at),
      updated_at: toNullableDate(row.updated_at),
    })))

    await insertRows(client, "saved_channels", [
      "id",
      "source_id",
      "portal_id",
      "identity_key",
      "channel_id",
      "xmltv_id",
      "number",
      "name",
      "genre_id",
      "genre",
      "cmd",
      "logo",
      "logo_url",
      "created_at",
      "updated_at",
    ], readRows("saved_channels").map((row) => ({
      id: row.id,
      source_id: row.portal_id,
      portal_id: row.portal_id,
      identity_key: `provider:${String(row.channel_id ?? "").trim().toLowerCase()}`,
      channel_id: row.channel_id,
      xmltv_id: row.xmltv_id,
      number: row.number,
      name: row.name,
      genre_id: row.genre_id,
      genre: row.genre,
      cmd: row.cmd,
      logo: row.logo,
      logo_url: row.logo_url,
      created_at: toDate(row.created_at),
      updated_at: toDate(row.updated_at),
    })), 1000)

    await resetSequence(client, "saved_portals", "id")
    await resetSequence(client, "saved_sources", "id")
    await resetSequence(client, "saved_channels", "id")

    await client.query("commit")
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}

async function verifyData() {
  const { rows } = await pool.query(`
    select 'saved_portals' as table_name, count(*)::int as count from saved_portals
    union all select 'saved_sources', count(*)::int from saved_sources
    union all select 'saved_channels', count(*)::int from saved_channels
    union all select 'user', count(*)::int from "user"
    union all select 'session', count(*)::int from session
    union all select 'account', count(*)::int from account
    union all select 'verification', count(*)::int from verification
    order by table_name
  `)

  for (const row of rows) {
    console.log(`${row.table_name}: ${row.count}`)
  }
}

async function insertRows(client, table, columns, rows, batchSize = 500) {
  if (!rows.length) {
    return
  }

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)
    const values = []
    const placeholders = batch.map((row, rowIndex) => {
      const offset = rowIndex * columns.length
      for (const column of columns) {
        values.push(row[column])
      }

      return `(${columns.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`
    })

    await client.query(
      `insert into ${table} (${columns.join(", ")}) values ${placeholders.join(", ")}`,
      values
    )
  }
}

async function resetSequence(client, table, column) {
  await client.query(
    `select setval(pg_get_serial_sequence($1, $2), coalesce((select max(${column}) from ${table}), 1), true)`,
    [table, column]
  )
}

function readRows(table) {
  if (!hasTable(table)) {
    return []
  }

  return sqlite.prepare(`select * from ${table}`).all()
}

function hasTable(table) {
  const row = sqlite
    .prepare("select name from sqlite_master where type = 'table' and name = ?")
    .get(table)

  return Boolean(row)
}

function toDate(value) {
  const date = toNullableDate(value)

  if (!date) {
    throw new Error(`Expected timestamp value, received ${value}`)
  }

  return date
}

function toNullableDate(value) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  if (value instanceof Date) {
    return value
  }

  const numeric = Number(value)

  if (Number.isFinite(numeric)) {
    return new Date(numeric)
  }

  return new Date(String(value))
}

function readEnv(name) {
  if (process.env[name]) {
    return process.env[name]
  }

  const envPath = path.join(rootDir, ".env")

  if (!fs.existsSync(envPath)) {
    return ""
  }

  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`))

  if (!line) {
    return ""
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")
}
