-- Moves the iptv-epg.org channel directory off the local filesystem (data/epg/*.json)
-- and into Postgres, so it works on read-only serverless filesystems.

CREATE TABLE IF NOT EXISTS epg_countries (
  code TEXT PRIMARY KEY,
  channel_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS epg_channels (
  country_code TEXT NOT NULL REFERENCES epg_countries(code) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  channel_id_lower TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  PRIMARY KEY (country_code, channel_id)
);

CREATE INDEX IF NOT EXISTS epg_channels_channel_id_lower_idx
  ON epg_channels (channel_id_lower);

CREATE INDEX IF NOT EXISTS epg_channels_name_normalized_idx
  ON epg_channels (name_normalized);
