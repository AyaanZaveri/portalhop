begin;

-- Keep a source-scoped deterministic identity for every saved channel. The
-- existing serial ID remains the durable reference used by favorites/groups.
alter table saved_channels add column if not exists identity_key text;

with identity_bases as (
  select
    channel.id,
    channel.source_id,
    case
      when source.source_type = 'm3u' then concat_ws(
        '|',
        'm3u',
        regexp_replace(lower(btrim(channel.xmltv_id)), '[[:space:]]*@[^@[:space:]]+$', ''),
        lower(btrim(channel.name)),
        lower(btrim(channel.genre)),
        regexp_replace(
          lower(split_part(btrim(channel.cmd), '?', 1)),
          '^ffmpeg[[:space:]]+',
          ''
        )
      )
      else 'provider:' || lower(btrim(channel.channel_id))
    end as identity_base
  from saved_channels as channel
  join saved_sources as source on source.id = channel.source_id
), numbered as (
  select
    id,
    identity_base,
    row_number() over (
      partition by source_id, identity_base
      order by id
    ) as occurrence
  from identity_bases
)
update saved_channels as channel
set identity_key = numbered.identity_base || case
  when numbered.occurrence = 1 then ''
  else '#' || numbered.occurrence
end
from numbered
where channel.id = numbered.id;

alter table saved_channels alter column identity_key set not null;
create unique index if not exists saved_channels_source_identity_key_idx
  on saved_channels(source_id, identity_key);

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
