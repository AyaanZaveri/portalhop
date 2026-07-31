-- Signed-in users' named collections of favorite channels. Channel memberships
-- are separate so one channel can belong to more than one group.
begin;

create table if not exists favorite_groups (
  id serial primary key,
  user_id text not null references "user"(id) on delete cascade,
  name text not null,
  icon text not null default 'star',
  created_at timestamp not null
);

create index if not exists favorite_groups_user_id_created_at_idx
  on favorite_groups (user_id, created_at);

create table if not exists favorite_group_channels (
  favorite_group_id integer not null references favorite_groups(id) on delete cascade,
  channel_key text not null,
  created_at timestamp not null,
  primary key (favorite_group_id, channel_key)
);

commit;
