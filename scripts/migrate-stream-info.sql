-- What a stream turned out to be, once somebody watched it.
--
-- Nothing here can be known from a catalogue. A portal hands over a name, a
-- number and a URL; what comes down that URL is only discoverable by opening
-- it, and opening 112,130 of them to fill this table in is not a refresh, it is
-- a denial of service against your own portals. So it is written by the player:
-- one row the first time a stream plays, updated whenever it plays again.
--
-- That makes the table sparse and self-selecting in the way that matters. The
-- streams with rows are the streams somebody watched, which are exactly the
-- ones they will be choosing between in the sources drawer.
--
-- Keyed on saved_channels(id) rather than on the channel identity: this
-- describes one portal's copy. Two portals carrying the same channel at
-- different qualities is the entire reason for showing it.
--
-- Idempotent; safe to re-run.
-- Usage: node scripts/run-sql.mjs scripts/migrate-stream-info.sql

begin;

create table if not exists saved_channel_stream_info (
  saved_channel_id integer primary key
    references saved_channels(id) on delete cascade,

  -- Both dimensions, not just the height the badge shows. 4K is a width
  -- question -- 3840x1608 is a 4K film in a letterbox and 2160 of height is
  -- not what makes it one -- and the label is computed from the pair.
  width integer,
  height integer,

  -- Kept as sent: 59.94 is not 60, and rounding it here would lose the
  -- difference between a broadcast feed and a re-encode.
  frame_rate real,

  -- What the stream declares, in bits per second, never what a viewing
  -- measured. A declared bandwidth is a property of the rendition and can be
  -- compared between two portals; a measured average is a reading of one
  -- network on one evening, and storing it would present that as a fact about
  -- the stream.
  bandwidth integer,

  -- When it was last seen. A portal can requantise a channel underneath a
  -- stored row, so a reading has to carry its own age -- without this, a figure
  -- from March looks exactly like one from this morning.
  seen_at timestamp not null default now()
);

commit;
