# Custom EPG sources — implementation plan

## Goal

Let users add their own EPG (XMLTV URL) as a **reusable library of EPG sources**,
and pick, per saved portal, which EPG to use: **None · Portal's own EPG ·
iptv-epg.org (built-in) · a custom source**. One custom source can be shared by
many portals.

## How EPG works today (context)

- An EPG "source" is just an XMLTV URL. Today there is one hardcoded global list
  (`src/lib/epg-sources.ts`, 78 country files from iptv-epg.org).
- Refresh parses each XMLTV and stores **only channel metadata** (id, name, logo,
  normalized match keys) in `epg_channels` (keyed by `country_code` →
  `epg_countries`). Global/shared cache. Driven one country per request by
  `POST /api/epg` (serverless timeout).
- **Programmes are not stored.** `POST /api/channel-epg` matches a channel via
  `findEpgSourceForChannel(...)` → gets the source URL → calls
  `fetchAndParseEpgProgrammes(url, [channelId])` to pull that channel's
  programmes live.
- The client (`src/app/page.tsx`) calls `/api/channel-epg` with
  `source: logoSource` — so today the guide source is coupled to the global
  `logoSource` ("provider" | "epg") setting. This plan decouples them.
- `src/lib/epg-parser.ts` already exposes URL-generic
  `fetchAndParseEpg(url): EpgChannel[]` and
  `fetchAndParseEpgProgrammes(url, ids)`. Reuse both as-is.

## Data model (src/db/schema.ts)

New table `userEpgSources` — the reusable library (per user):

```
userEpgSources
  id            serial pk
  userId        text  fk user.id on delete cascade  (index)
  name          text  notNull
  url           encryptedText notNull   // may embed credentials (xmltv.php?user&pass) → encrypt at rest
  channelCount  integer notNull default 0
  refreshedAt   timestamp            // null until first successful parse
  createdAt     timestamp notNull
  updatedAt     timestamp notNull
```

New table `userEpgChannels` — parsed directory per source (mirrors `epgChannels`):

```
userEpgChannels
  epgSourceId     integer fk userEpgSources.id on delete cascade
  channelId       text notNull
  name            text notNull
  logoUrl         text            // nullable
  channelIdLower  text notNull
  nameNormalized  text notNull
  primaryKey (epgSourceId, channelId)
  index user_epg_channels_channel_id_lower_idx (channelIdLower)
  index user_epg_channels_name_normalized_idx  (nameNormalized)
```

`savedSources` gains the EPG selection:

```
  epgMode      text notNull default 'portal'   // 'none' | 'portal' | 'iptv-org' | 'custom'
  epgSourceId  integer fk userEpgSources.id on delete set null   // set only when epgMode = 'custom'
```

- On `userEpgSources` delete, `savedSources.epgSourceId` becomes null. In
  `flattenSavedSource` / resolution, treat `custom` + null id as `none`.
- Export `$inferSelect/$inferInsert` types and add relations (savedSources →
  userEpgSources one, userEpgSources → many userEpgChannels + many savedSources).

## Migration (scripts/migrate-custom-epg.sql + createSchema)

Follow the existing raw-SQL convention (`scripts/migrate-*.sql`) and also add the
tables/columns to `createSchema()` in `scripts/migrate-sqlite-to-postgres.mjs`
for fresh installs.

```sql
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
create index if not exists user_epg_sources_user_id_idx on user_epg_sources(user_id);

create table if not exists user_epg_channels (
  epg_source_id integer not null references user_epg_sources(id) on delete cascade,
  channel_id text not null,
  name text not null,
  logo_url text,
  channel_id_lower text not null,
  name_normalized text not null,
  primary key (epg_source_id, channel_id)
);
create index if not exists user_epg_channels_channel_id_lower_idx on user_epg_channels(channel_id_lower);
create index if not exists user_epg_channels_name_normalized_idx on user_epg_channels(name_normalized);

alter table saved_sources add column if not exists epg_mode text not null default 'portal';
alter table saved_sources add column if not exists epg_source_id integer references user_epg_sources(id) on delete set null;
```

Default `epg_mode = 'portal'` (provider EPG) for existing rows — see Open
decisions for the behavior-preservation nuance.

## Backend: EPG source library

- `src/lib/user-epg-store.ts` (new), mirroring `epg-store.ts`:
  - `saveUserEpgChannels(epgSourceId, channels)` — dedup by id, chunked insert
    (≤1000 rows/insert), replace the source's channels wholesale in a tx, and
    upsert `channelCount` + `refreshedAt` on `userEpgSources`.
  - `refreshUserEpgSource(id)` — decrypt url → `fetchAndParseEpg(url)` →
    `saveUserEpgChannels`.
  - `findCustomEpgChannel(epgSourceId, keys: {id?, name?}[])` — indexed
    equality probe over `userEpgChannels` (reuse `normalizeChannelName`), returns
    the matched `channelId` or null.
- `src/db/user-epg-sources.ts` (new): `selectUserEpgSources(db, userId)`,
  `selectUserEpgSource(db, id)`, `deleteUserEpgSource(db, id, userId)` — mirror
  `db/saved-sources.ts`, decrypting `url` on read via the schema `encryptedText`
  type (transparent).
- API routes:
  - `src/app/api/epg-sources/route.ts`: `GET` (list user's sources), `POST`
    (create `{name, url}` → insert → kick a first `refreshUserEpgSource`).
  - `src/app/api/epg-sources/[id]/route.ts`: `PATCH` (rename / change url — re-refresh
    on url change), `DELETE`.
  - `src/app/api/epg-sources/[id]/refresh/route.ts`: `POST` → `refreshUserEpgSource`
    (one source per request, like the country refresh). Return channelCount +
    refreshedAt.
  - All behind `requireUser`; verify ownership (`userId === user.id`) on id routes.

## Matching & guide resolution (src/app/api/channel-epg/route.ts)

Replace the `source: "provider" | "epg"` param with the channel's portal EPG
selection, sent by the client: `{ epgMode, epgSourceId }` (plus the existing
channel id/name/xmltvId and portal request).

Branch on `epgMode`:
- `none` → `{ programmes: [] }`.
- `portal` → existing provider path (Stalker `fetchPortalEpg`; xtream/m3u return []).
- `iptv-org` → existing `findEpgSourceForChannel([...])` + `fetchAndParseEpgProgrammes`
  (today's `source: "epg"` path, unchanged).
- `custom` → `findCustomEpgChannel(epgSourceId, [{id: xmltvId}, {id: channelId}, {name: channelName}])`;
  if matched, load the `userEpgSources.url` (decrypted) and
  `fetchAndParseEpgProgrammes(url, [matchedChannelId])`. On no match → `[]`.

## Saved-source EPG selection (portals API + types)

- `src/lib/source-types.ts` `SavedSourceRecord`: add `epgMode: 'none'|'portal'|'iptv-org'|'custom'`
  and `epgSourceId: number | null`.
- `src/lib/portal-form-utils.ts`: parse/validate `epgMode` (whitelist) +
  `epgSourceId` (integer or null) from request bodies.
- `POST /api/portals` and `PATCH /api/portals/[id]`: persist `epgMode` +
  `epgSourceId` on `savedSources`. Guard: `epgSourceId` must belong to the user
  and only be set when `epgMode === 'custom'` (else force null).
- `db/saved-sources.ts` `flattenSavedSource`: include `epgMode`/`epgSourceId`;
  when `epgMode==='custom'` but `epgSourceId` is null (deleted source), treat as
  `'none'`.

## Client wiring (src/app/page.tsx)

- The guide effect (`loadChannelEpg`, ~line 891) currently sends `source: logoSource`.
  Change to send the selected channel's portal EPG config: `epgMode` +
  `epgSourceId` from `selectedChannel.portalSource` (thread these through the
  `PortalSource`/channel objects, which already carry the source request).
- **Logos become per-portal too** (see below): `getChannelLogoUrl` takes the
  channel's portal `epgMode`/`epgSourceId` instead of the global `logoSource`.

## UI — Settings → EPG & Logos (src/app/settings/epg/page.tsx)

Add a **"Custom EPG Sources"** section (below the existing logo-source + refresh
sections):
- List `userEpgSources`: name, url (masked/truncated), channel count, last
  refreshed. Row actions via dropdown (Rename / Change URL / Refresh / Delete),
  mirroring `settings/sources/page.tsx` patterns (Dialog + AlertDialog + toasts).
- "Add EPG source" button → dialog (name + url) → `POST /api/epg-sources`.
- Per-row "Refresh" → `POST /api/epg-sources/[id]/refresh` with a spinner.

## UI — Sources add/edit (src/components/add-portal-sheet.tsx + settings/sources edit)

Add an **"EPG" field** (Combobox/Select) to the add + edit flows:
- Options: `None` · `Portal's own EPG` · `iptv-epg.org` · each custom source ·
  `+ Create new EPG source…` (inline dialog → creates in the library, then selects it).
- Maps to `{ epgMode, epgSourceId }`: None→`none`, Portal→`portal`,
  iptv-epg.org→`iptv-org`, a custom source→`custom` + its id.
- Persist on save through the portals POST/PATCH.
- Fetch the source list from `GET /api/epg-sources` to populate the dropdown.

## EPG selection is fully per-portal (no global setting)

The global `logoSource: "provider" | "epg"` user setting is **removed**. A
portal's `epgMode`/`epgSourceId` drives **both** its guide and its channel logos:

| epgMode    | guide source                          | logo source                 |
| ---------- | ------------------------------------- | --------------------------- |
| `portal`   | portal API (Stalker) / xtream xmltv   | provider channel logo       |
| `iptv-org` | iptv-epg.org directory                | iptv-epg.org logo           |
| `custom`   | the custom EPG source URL             | custom source's `logoUrl`   |
| `none`     | — (no guide)                          | provider channel logo       |

- `getChannelLogoUrl(channel, ...)` changes from taking the global `logoSource`
  to taking the channel's portal `epgMode` + `epgSourceId`, then resolving the
  logo from the matching directory (`epgChannels` for `iptv-org`,
  `userEpgChannels` for `custom`, provider logo otherwise).
- Remove `logoSource` from `UserSettingsData` / `DEFAULT_USER_SETTINGS` /
  `sanitizeSettingsPatch` / `user_settings` table (migration: drop column, or
  leave it dormant and stop reading it) and from the Settings → EPG & Logos page
  (the provider-vs-epg logo toggle goes away; logos now follow each portal's EPG).
- The client needs the `userEpgChannels` directory for a portal's custom source
  to resolve logos client-side — extend `/api/epg/channels` (or add
  `/api/epg-sources/[id]/channels`) to return a custom source's channel map, and
  merge it into the lookup the browser already builds for iptv-epg.org.

## Reconciliation notes

- **iptv-epg.org becomes a built-in per-portal option** (`epgMode: 'iptv-org'`),
  powered by the existing global directory + `POST /api/epg` refresh — no change
  to that pipeline, just surfaced in the per-portal picker instead of a global
  toggle.

## Open decisions / defaults

1. **Migration default (`epg_mode`)**: now drives both guide *and* logos.
   `'portal'` is simplest/explicit. But existing users on the (removed) global
   `logoSource: 'epg'` would lose both iptv-epg.org guides and logos unless we
   default their portals to `'iptv-org'`. Options: default everything to
   `'portal'`; or per-user, default to `'iptv-org'` when that user's old
   `logoSource === 'epg'`, else `'portal'` (best behavior-preservation).
2. **On-demand cost**: a large custom XMLTV is re-fetched per guide open (same
   tradeoff as today's global directory). Fine to start; a short server-side
   cache of parsed programmes is a later optimization.
3. **URL validation**: accept `.xml` and `.xml.gz`; validate reachability on add
   (the first refresh surfaces errors).

## Ordered implementation checklist

1. Schema: add `userEpgSources`, `userEpgChannels`, `savedSources.epgMode`/`epgSourceId` + relations + types.
2. Migration SQL + `createSchema()` update; run against DB.
3. `user-epg-store.ts` (save/refresh/find) + `db/user-epg-sources.ts`.
4. `/api/epg-sources` routes (list/create/patch/delete/refresh).
5. `channel-epg` route: switch to `epgMode`/`epgSourceId` branching.
6. Portals API + `source-types` + `portal-form-utils` + `flattenSavedSource`: persist EPG selection.
7. `page.tsx`: send `epgMode`/`epgSourceId` to `channel-epg`; switch `getChannelLogoUrl` to per-portal EPG.
8. Remove global `logoSource` (settings type/default/sanitize/table + the logo toggle UI); expose custom-source channel maps to the client for logos.
9. Settings → EPG & Logos: custom-source library UI.
10. Sources add/edit: EPG picker + inline create.
11. Verify (below).

## Verification

- Add a custom EPG source (real XMLTV url) in Settings → refresh → channel count
  populates, `refreshedAt` set; raw DB shows `url` encrypted (`enc:v1:`).
- Add/edit a portal → set EPG to the custom source → open one of its channels →
  guide shows programmes from the custom XMLTV.
- Set another portal to the **same** custom source → confirmed shared (one row in
  `userEpgSources`, two `savedSources.epgSourceId` pointing at it).
- Portal / iptv-org / none modes each resolve correctly; deleting a custom source
  nulls dependents and they fall back to `none`.
- Typecheck + lint clean; verify guide fetch in the browser.
