-- Compact favorite/favorite-group channel keys to [sourceId, savedChannelId].
--
-- This is the second half of migrate-stable-channel-identities.sql, split out
-- because that script's first half can no longer be run: it derives M3U
-- identity keys from saved_channels.cmd in SQL, and cmd is now an encrypted
-- column. Use scripts/backfill-channel-identity-keys.mjs for that half, then
-- this file. Nothing here touches cmd, so it runs unchanged.
--
-- Usage: node scripts/run-sql.mjs scripts/migrate-favorite-channel-keys.sql

begin;

-- Existing saved-channel keys also include mutable provider metadata. Compact
-- them while their current row IDs are still authoritative.
with candidates as (
  select
    id,
    user_id,
    format(
      '[%s,%s]',
      (channel_key::jsonb ->> 0)::integer,
      (channel_key::jsonb ->> 1)::integer
    ) as next_key
  from favorites
  where channel_key ~ '^[[:space:]]*[[][[:space:]]*[0-9]+[[:space:]]*,[[:space:]]*[0-9]+'
), duplicates as (
  select
    id,
    row_number() over (
      partition by user_id, next_key
      order by id
    ) as occurrence
  from candidates
)
delete from favorites as legacy
using duplicates
where legacy.id = duplicates.id
  and duplicates.occurrence > 1;

update favorites
set channel_key = format(
  '[%s,%s]',
  (channel_key::jsonb ->> 0)::integer,
  (channel_key::jsonb ->> 1)::integer
)
where channel_key ~ '^[[:space:]]*[[][[:space:]]*[0-9]+[[:space:]]*,[[:space:]]*[0-9]+';

with candidates as (
  select
    favorite_group_id,
    channel_key,
    format(
      '[%s,%s]',
      (channel_key::jsonb ->> 0)::integer,
      (channel_key::jsonb ->> 1)::integer
    ) as next_key
  from favorite_group_channels
  where channel_key ~ '^[[:space:]]*[[][[:space:]]*[0-9]+[[:space:]]*,[[:space:]]*[0-9]+'
), duplicates as (
  select
    favorite_group_id,
    channel_key,
    row_number() over (
      partition by favorite_group_id, next_key
      order by channel_key
    ) as occurrence
  from candidates
)
delete from favorite_group_channels as legacy
using duplicates
where legacy.favorite_group_id = duplicates.favorite_group_id
  and legacy.channel_key = duplicates.channel_key
  and duplicates.occurrence > 1;

update favorite_group_channels
set channel_key = format(
  '[%s,%s]',
  (channel_key::jsonb ->> 0)::integer,
  (channel_key::jsonb ->> 1)::integer
)
where channel_key ~ '^[[:space:]]*[[][[:space:]]*[0-9]+[[:space:]]*,[[:space:]]*[0-9]+';

commit;
