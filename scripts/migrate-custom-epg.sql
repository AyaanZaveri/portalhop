-- Custom EPG sources: per-user reusable EPG (XMLTV) library + per-portal EPG
-- selection. Idempotent; safe to re-run.

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

-- Behavior preservation: EPG-for-guide used to follow the global logo_source
-- setting, so users who had logo_source = 'epg' keep iptv-epg.org guides+logos.
update saved_sources ss
set epg_mode = 'iptv-org'
from user_settings us
where us.user_id = ss.user_id
  and us.logo_source = 'epg'
  and ss.epg_mode = 'portal';
