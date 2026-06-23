begin;

create table if not exists saved_sources (
  id serial primary key,
  name text not null,
  source_type text not null,
  channel_count integer not null default 0,
  created_at timestamp not null,
  updated_at timestamp not null,
  constraint saved_sources_source_type_check
    check (source_type in ('stalker', 'xtream', 'm3u'))
);

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

insert into saved_sources (
  id,
  name,
  source_type,
  channel_count,
  created_at,
  updated_at
)
select
  id,
  name,
  'stalker',
  channel_count,
  created_at,
  updated_at
from saved_portals
on conflict (id) do nothing;

insert into saved_stalker_sources (
  source_id,
  portal_url,
  mac,
  serial,
  device_id,
  device_id_2,
  signature,
  timezone,
  stb_type,
  endpoint
)
select
  id,
  portal_url,
  mac,
  serial,
  device_id,
  device_id_2,
  signature,
  timezone,
  stb_type,
  endpoint
from saved_portals
on conflict (source_id) do nothing;

select setval(
  pg_get_serial_sequence('saved_sources', 'id'),
  greatest(
    coalesce((select max(id) from saved_sources), 0),
    1
  ),
  true
);

alter table saved_channels add column if not exists source_id integer;

alter table saved_channels
  alter column portal_id drop not null;

update saved_channels
set source_id = portal_id
where source_id is null
  and portal_id is not null;

alter table saved_channels
  alter column source_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'saved_channels_source_id_saved_sources_id_fk'
  ) then
    alter table saved_channels
      add constraint saved_channels_source_id_saved_sources_id_fk
      foreign key (source_id) references saved_sources(id) on delete cascade;
  end if;
end $$;

create index if not exists saved_channels_source_id_idx on saved_channels(source_id);
create index if not exists saved_sources_updated_at_idx on saved_sources(updated_at);

alter table saved_sources enable row level security;
alter table saved_stalker_sources enable row level security;
alter table saved_xtream_sources enable row level security;
alter table saved_m3u_sources enable row level security;

commit;
