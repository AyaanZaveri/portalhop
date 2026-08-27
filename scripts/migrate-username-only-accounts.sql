-- Allows shared username/password accounts to exist without an email address.
-- Run with: node scripts/run-sql.mjs scripts/migrate-username-only-accounts.sql

alter table "user" alter column email drop not null;
