-- Adds Better Auth's username-plugin fields without changing existing account
-- identifiers or data. Run with: node scripts/run-sql.mjs scripts/migrate-usernames.sql

begin;

alter table "user" add column if not exists username text;
alter table "user" add column if not exists display_username text;
create unique index if not exists user_username_unique_idx on "user" (username);

commit;
