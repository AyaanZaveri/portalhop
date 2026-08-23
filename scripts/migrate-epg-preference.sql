-- One guide per channel, rather than one per stream.
--
-- A channel arrives once from every source that carries it, and each source has
-- its own idea of where a schedule comes from. They are all describing the same
-- broadcast, so reading whichever stream happens to be playing meant the
-- schedule changed when the picture did not -- and a channel carried by eight
-- sources needed its guide corrected eight times, on whichever copy was ranked
-- first at the time.
--
-- The choice is made by what *kind* of guide it is, not by which stream plays.
-- Two columns carry that:
--
--   user_settings.epg_kind_order        the global ranking, reorderable
--   channel_identity_prefs.epg_saved_channel_id  a per-channel exception
--
-- Nothing writes the automatic answer down. A channel_identity_prefs row exists
-- only where someone overruled the ranking, so changing the ranking re-resolves
-- every channel except the ones that were pinned, and no stored value can be
-- mistaken for a decision. Same rule the source order already follows.
--
-- Idempotent; safe to re-run.
-- Usage: node scripts/run-sql.mjs scripts/migrate-epg-preference.sql

begin;

-- 1. The global ranking --------------------------------------------------
--
-- iptv-org first: it is one curated dataset covering everything, so a catalogue
-- resolved against it is consistent channel to channel and shares a single
-- fetch per country. A source's own guide last, because its quality is the most
-- variable thing here -- it still wins for the channels only that source
-- carries, which is the case it exists for.
--
-- jsonb rather than three columns or an enum array: it is an ordering, the set
-- is small and closed, and the client sanitizes it on the way in and out.
alter table user_settings
  add column if not exists epg_kind_order jsonb not null
    default '["iptv-org","custom","portal"]'::jsonb;

-- 2. The per-channel exception -------------------------------------------
--
-- channel_identity_prefs is created by migrate-channel-identities.sql. Create it
-- here too so this migration stands alone on a database that never ran that one.
create table if not exists channel_identity_prefs (
  user_id text not null references "user"(id) on delete cascade,
  identity_key text not null,
  epg_mode text,
  epg_source_id integer references user_epg_sources(id) on delete set null,
  display_name text,
  updated_at timestamp not null default now(),
  primary key (user_id, identity_key)
);

-- Pins the stream, not the kind. A kind is ambiguous the moment two of a
-- channel's sources share one, and the row in the sources drawer is what the
-- person was looking at when they chose.
--
-- on delete set null rather than cascade: deleting the source should drop the
-- channel back to the ranking, not delete a row that may also carry a
-- display_name. resolveChannelEpg treats a pin it cannot honour as absent.
alter table channel_identity_prefs
  add column if not exists epg_saved_channel_id integer
    references saved_channels(id) on delete set null;

commit;
