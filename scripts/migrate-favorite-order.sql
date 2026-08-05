-- Manual ordering for favourites and for each group's channels.
--
-- Position lives on the membership row, not the channel: favorites is one row
-- per (user, channel) and favorite_group_channels is one row per (group,
-- channel), so a channel in several groups holds an independent position in
-- each of them.
--
-- Backfilled from created_at so existing lists keep the order they already
-- appear in rather than jumping on first load.
--
-- Usage: node scripts/run-sql.mjs scripts/migrate-favorite-order.sql

begin;

alter table favorites
  add column if not exists position integer not null default 0;

alter table favorite_group_channels
  add column if not exists position integer not null default 0;

update favorites as f
set position = ordered.rn
from (
  select id, row_number() over (partition by user_id order by created_at, id) - 1 as rn
  from favorites
) as ordered
where f.id = ordered.id;

update favorite_group_channels as c
set position = ordered.rn
from (
  select
    favorite_group_id,
    channel_key,
    row_number() over (
      partition by favorite_group_id
      order by created_at, channel_key
    ) - 1 as rn
  from favorite_group_channels
) as ordered
where c.favorite_group_id = ordered.favorite_group_id
  and c.channel_key = ordered.channel_key;

commit;
