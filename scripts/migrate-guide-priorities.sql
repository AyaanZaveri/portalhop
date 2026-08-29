-- Independent playback and XMLTV-provider rankings. Safe to run repeatedly.
begin;

alter table user_settings
  add column if not exists source_priority_ids jsonb not null default '[]'::jsonb;

alter table user_settings
  add column if not exists epg_provider_order jsonb not null default '["iptv-org"]'::jsonb;

commit;
