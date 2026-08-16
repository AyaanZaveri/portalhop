-- Whether a figure is the stream's claim or our own measurement.
--
-- Most streams declare a resolution and little else. The web build works the
-- rest out for itself -- it weighs each fragment for a bitrate, and counts
-- frames over a few seconds for a rate -- and those numbers are worth keeping,
-- because a channel showing nothing is worse than a channel showing a figure
-- with its provenance attached.
--
-- Attached, not hidden: a declared bandwidth is a property of the rendition and
-- comparable between two portals, while a measured one is a reading of one
-- network on one evening. Marked, the interface can say so; unmarked, the two
-- would sit side by side looking equally authoritative.
--
-- Idempotent; safe to re-run.
-- Usage: node scripts/run-sql.mjs scripts/migrate-stream-info-measured.sql

begin;

alter table saved_channel_stream_info
  add column if not exists frame_rate_measured boolean not null default false,
  add column if not exists bandwidth_measured boolean not null default false;

commit;
