-- Per-user settings synced across devices: which sources are enabled on the
-- home page, the iptv-org toggle, and display preferences that used to live in
-- the browser's localStorage.
begin;

create table if not exists user_settings (
  user_id text primary key references "user"(id) on delete cascade,
  enabled_source_ids jsonb not null default '[]'::jsonb,
  iptv_org_enabled boolean not null default true,
  logo_source text not null default 'provider',
  use_proxy boolean not null default true,
  use_image_proxy boolean not null default true,
  favorites_token text unique,
  updated_at timestamp not null
);

alter table user_settings
  add column if not exists use_image_proxy boolean not null default true;

alter table user_settings
  add column if not exists favorites_token text unique;

alter table user_settings
  add column if not exists hidden_categories jsonb not null default '[]'::jsonb;

create table if not exists hidden_category_groups (
  user_id text not null references "user"(id) on delete cascade,
  source_id integer not null,
  category text not null,
  created_at timestamp not null,
  primary key (user_id, source_id, category)
);

insert into hidden_category_groups (user_id, source_id, category, created_at)
select
  settings.user_id,
  (group_entry->>'sourceId')::integer,
  group_entry->>'category',
  now()
from user_settings as settings
cross join lateral jsonb_array_elements(settings.hidden_categories) as group_entry
where jsonb_typeof(group_entry) = 'object'
  and (group_entry->>'sourceId') ~ '^-?[0-9]+$'
  and coalesce(group_entry->>'category', '') <> ''
on conflict do nothing;

alter table user_settings drop column if exists hidden_categories;

alter table user_settings enable row level security;

commit;
