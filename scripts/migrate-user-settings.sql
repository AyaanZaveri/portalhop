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

alter table user_settings enable row level security;

commit;
