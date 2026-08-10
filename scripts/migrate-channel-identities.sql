-- Storage for "one channel, many streams".
--
-- A channel is an identity: the guide id, and the metadata that belongs to the
-- channel rather than to any portal's copy of it. A stream is a saved_channels
-- row: one portal's name, number and cmd for that channel. A channel with no
-- guide id has exactly one stream and is that stream.
--
-- Nothing here materialises group membership. Which streams belong to which
-- channel is derived at read time by packages/shared/src/channel-grouping.ts,
-- because that heuristic is still being tuned and rows outlive the heuristic
-- that produced them: stored membership would mean a threshold change silently
-- repoints someone's saved order at a different channel. Derived, the same
-- change makes an override inert instead of wrong.
--
-- Every table below is therefore sparse — a row only where the user has
-- actually corrected something — and keyed on identity_key, which is
-- "id:<normalized xmltv id>" and never a name key. See identityKeyFor.
--
-- Two rules the superseded migrate-stable-channel-identities.sql broke, kept
-- here deliberately: no key is derived in SQL (the tokenizer is Unicode-regex
-- JS and a second implementation would drift), and nothing reads
-- saved_channels.cmd (it is encrypted with a random IV, so it cannot be
-- matched or joined).
--
-- Idempotent; safe to re-run.
-- Usage: node scripts/run-sql.mjs scripts/migrate-channel-identities.sql

begin;

-- 1. Global source order ------------------------------------------------
--
-- A column rather than an array in user_settings: deleting a source silently
-- orphans an array entry, and a column cannot.
alter table saved_sources
  add column if not exists priority integer not null default 0;

-- Start from the order sources are already in rather than all-zeros, so the
-- first drag reorders a list the user recognises instead of an arbitrary one.
update saved_sources s
set priority = ordered.rn
from (
  select id, row_number() over (partition by user_id order by id) as rn
  from saved_sources
) ordered
where s.id = ordered.id
  and s.priority = 0;

-- 2. Per-channel metadata and overrides ---------------------------------
--
-- The channel's own facts, as distinct from any stream's. Sparse: a row only
-- once the user overrides something. Everything null means "inherit from the
-- portal", which is what the absence of a row also means.
create table if not exists channel_identity_prefs (
  user_id text not null references "user"(id) on delete cascade,
  identity_key text not null,
  -- Per-channel EPG override. Falls back to saved_sources.epg_mode when null,
  -- so the portal's configuration stays the default and this is the exception.
  epg_mode text,
  epg_source_id integer references user_epg_sources(id) on delete set null,
  -- A name the user chose over the guide's.
  display_name text,
  updated_at timestamp not null default now(),
  primary key (user_id, identity_key)
);

-- 3. Which stream plays first -------------------------------------------
--
-- References saved_channels(id) rather than saved_sources(id): one portal can
-- carry the same channel twice (HD and 4K), so the ordering is over streams,
-- not over portals. The cascade also means a portal dropping a channel cleans
-- up its ordering for free.
create table if not exists channel_identity_source_order (
  user_id text not null references "user"(id) on delete cascade,
  identity_key text not null,
  saved_channel_id integer not null references saved_channels(id) on delete cascade,
  position integer not null default 0,
  primary key (user_id, identity_key, saved_channel_id)
);

create index if not exists channel_identity_source_order_lookup_idx
  on channel_identity_source_order (user_id, identity_key, position);

-- 4. The escape hatch ---------------------------------------------------
--
-- Keyed on the stream, not on the group, because that is what the statement is
-- about: this copy does not belong with those, or this copy belongs with that
-- identity whatever the key says. Grouping is a guess and will sometimes be
-- wrong; this is how someone says so, and it has to outlive any retuning.
create table if not exists channel_group_overrides (
  user_id text not null references "user"(id) on delete cascade,
  saved_channel_id integer not null references saved_channels(id) on delete cascade,
  mode text not null,
  -- Only for mode = 'attach'. Always an id: key — a name key moves when a
  -- portal renames the channel, taking the correction with it.
  identity_key text,
  created_at timestamp not null default now(),
  primary key (user_id, saved_channel_id),
  constraint channel_group_overrides_mode_check
    check (mode in ('detach', 'attach')),
  constraint channel_group_overrides_attach_needs_key
    check (mode <> 'attach' or identity_key is not null)
);

-- 5. Resolving a shared link cold ---------------------------------------
--
-- A deep link carries the guide id, so opening one on a device with no
-- catalogue loaded is a lookup by xmltv_id across the user's sources. That is
-- the first server-side read that spans sources, and without this it is a scan
-- of every channel the user has.
create index if not exists saved_channels_xmltv_id_idx
  on saved_channels (xmltv_id)
  where xmltv_id <> '';

commit;
