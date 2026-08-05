-- Marks saved channels whose EPG match was chosen by hand, so a refresh does
-- not overwrite it with the provider's own xmltv id.
--
-- Usage: node scripts/run-sql.mjs scripts/migrate-xmltv-id-lock.sql

begin;

alter table saved_channels
  add column if not exists xmltv_id_locked boolean not null default false;

commit;
