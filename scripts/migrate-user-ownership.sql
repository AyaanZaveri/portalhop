-- Ties portals (saved_sources) and favorites to the user that created them.
-- Existing rows are backfilled to the owner account so nothing is lost.
begin;

-- Portals ownership -----------------------------------------------------------
alter table saved_sources
  add column if not exists user_id text references "user"(id) on delete cascade;

-- Backfill every pre-existing portal to the owner account.
update saved_sources
set user_id = 'LGbSoKNxrliKw7QUK0ZgztYUZ1LHF8GU'
where user_id is null;

alter table saved_sources
  alter column user_id set not null;

create index if not exists saved_sources_user_id_idx on saved_sources(user_id);

-- Favorites (new, per-user) ---------------------------------------------------
create table if not exists favorites (
  id serial primary key,
  user_id text not null references "user"(id) on delete cascade,
  channel_key text not null,
  created_at timestamp not null,
  constraint favorites_user_channel_unique unique (user_id, channel_key)
);

create index if not exists favorites_user_id_idx on favorites(user_id);

alter table favorites enable row level security;

commit;
