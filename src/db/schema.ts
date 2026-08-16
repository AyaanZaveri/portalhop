import { relations } from "drizzle-orm"
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { decryptSecret, encryptSecret } from "@/lib/source-encryption"

// A text column whose value is encrypted on the way to Postgres and decrypted
// on the way back, so saved-source credentials are never stored as plaintext.
// The stored SQL type is still plain `text`; only the contents differ, so no
// column-type migration is required. Drizzle skips these mappers for null
// values, so nullable credential columns are unaffected.
const encryptedText = customType<{ data: string; driverData: string }>({
  dataType() {
    return "text"
  },
  toDriver(value) {
    return encryptSecret(value)
  },
  fromDriver(value) {
    return decryptSecret(value)
  },
})

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
})

export const savedPortals = pgTable("saved_portals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  portalUrl: text("portal_url").notNull(),
  mac: text("mac").notNull(),
  serial: text("serial"),
  deviceId: text("device_id"),
  deviceId2: text("device_id_2"),
  signature: text("signature"),
  timezone: text("timezone").notNull(),
  stbType: text("stb_type").notNull(),
  endpoint: text("endpoint"),
  channelCount: integer("channel_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const savedSources = pgTable("saved_sources", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  channelCount: integer("channel_count").notNull().default(0),
  // Which EPG this portal's channels use, for both guide and logos:
  // 'portal' (provider's own), 'iptv-org' (built-in directory), 'custom'
  // (epgSourceId → a user EPG source), or 'none'.
  epgMode: text("epg_mode").notNull().default("portal"),
  epgSourceId: integer("epg_source_id").references(() => userEpgSources.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  enabledSourceIds: jsonb("enabled_source_ids")
    .notNull()
    .$type<number[]>()
    .default([]),
  iptvOrgEnabled: boolean("iptv_org_enabled").notNull().default(true),
  logoSource: text("logo_source").notNull().default("provider"),
  useProxy: boolean("use_proxy").notNull().default(true),
  useImageProxy: boolean("use_image_proxy").notNull().default(true),
  // A random, revocable secret that authorizes the public favorites-playlist
  // export URL without a session cookie (M3U players can't send one). Null
  // until the user first requests a playlist link; regenerating it rotates
  // out any previously shared URL.
  favoritesToken: text("favorites_token").unique(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  channelKey: text("channel_key").notNull(),
  // Manual order. Lives on the membership row, so it is the user's ordering of
  // their own favourites rather than a property of the channel.
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull(),
})

export const favoriteGroups = pgTable("favorite_groups", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("star"),
  createdAt: timestamp("created_at").notNull(),
})

export const favoriteGroupChannels = pgTable(
  "favorite_group_channels",
  {
    favoriteGroupId: integer("favorite_group_id")
      .notNull()
      .references(() => favoriteGroups.id, { onDelete: "cascade" }),
    channelKey: text("channel_key").notNull(),
    // Per-group order. There is one row per (group, channel), so a channel in
    // several groups carries a separate position in each — the orders cannot
    // bleed into one another.
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.favoriteGroupId, table.channelKey] })],
)

export const hiddenCategoryGroups = pgTable(
  "hidden_category_groups",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceId: integer("source_id").notNull(),
    category: text("category").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sourceId, table.category] })],
)

export const savedStalkerSources = pgTable("saved_stalker_sources", {
  sourceId: integer("source_id")
    .primaryKey()
    .references(() => savedSources.id, { onDelete: "cascade" }),
  portalUrl: encryptedText("portal_url").notNull(),
  mac: encryptedText("mac").notNull(),
  serial: encryptedText("serial"),
  deviceId: encryptedText("device_id"),
  deviceId2: encryptedText("device_id_2"),
  signature: encryptedText("signature"),
  timezone: text("timezone").notNull(),
  stbType: text("stb_type").notNull(),
  endpoint: encryptedText("endpoint"),
})

export const savedXtreamSources = pgTable("saved_xtream_sources", {
  sourceId: integer("source_id")
    .primaryKey()
    .references(() => savedSources.id, { onDelete: "cascade" }),
  serverUrl: encryptedText("server_url").notNull(),
  username: encryptedText("username").notNull(),
  password: encryptedText("password").notNull(),
  outputFormat: text("output_format").notNull(),
})

export const savedM3uSources = pgTable("saved_m3u_sources", {
  sourceId: integer("source_id")
    .primaryKey()
    .references(() => savedSources.id, { onDelete: "cascade" }),
  playlistUrl: encryptedText("playlist_url").notNull(),
  derivedXtreamServerUrl: encryptedText("derived_xtream_server_url"),
  derivedXtreamUsername: encryptedText("derived_xtream_username"),
  derivedXtreamPassword: encryptedText("derived_xtream_password"),
})

export const savedChannels = pgTable("saved_channels", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id")
    .notNull()
    .references(() => savedSources.id, { onDelete: "cascade" }),
  portalId: integer("portal_id").references(() => savedPortals.id, {
    onDelete: "cascade",
  }),
  // A deterministic source-scoped identity. Refreshes upsert on this instead
  // of deleting/recreating the channel row, preserving its primary key.
  identityKey: text("identity_key").notNull(),
  channelId: text("channel_id").notNull(),
  xmltvId: text("xmltv_id").notNull().default(""),
  // Set when someone picks the EPG match by hand. A refresh takes the
  // provider's xmltv id for every other row, which would silently undo that
  // choice at the moment they least expect it.
  xmltvIdLocked: boolean("xmltv_id_locked").notNull().default(false),
  number: text("number").notNull(),
  name: text("name").notNull(),
  genreId: text("genre_id").notNull(),
  genre: text("genre").notNull(),
  // Stream commands routinely embed the subscription itself: Xtream and most
  // M3U URLs carry the username and password in the path, and Stalker cmds
  // carry the portal MAC. That is the same secret `saved_*_sources` already
  // encrypts, so leaving it in cleartext here would undo that protection for
  // the majority of rows. Encrypted with the same AES-256-GCM scheme.
  //
  // Identity keys are derived from the plaintext cmd before insert (see
  // m3uStreamIdentity in db/saved-channels.ts), so encryption does not affect
  // them — but it does mean cmd can never be matched or filtered in SQL, since
  // a random IV makes the ciphertext non-deterministic.
  cmd: encryptedText("cmd").notNull(),
  logo: text("logo").notNull(),
  logoUrl: text("logo_url").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
}, (table) => [
  uniqueIndex("saved_channels_source_identity_key_idx").on(
    table.sourceId,
    table.identityKey,
  ),
])

/**
 * What a stream turned out to be, once somebody watched it.
 *
 * Created by scripts/migrate-stream-info.sql. Written by the player rather
 * than by a refresh: a portal's catalogue says what a channel is called, not
 * what comes down the wire, and finding that out means opening the stream.
 * Opening every stream in a catalogue to fill this in is not a refresh.
 *
 * Keyed on the saved channel — one portal's copy — because two portals
 * carrying the same channel at different qualities is the whole reason to
 * show it.
 */
export const savedChannelStreamInfo = pgTable("saved_channel_stream_info", {
  savedChannelId: integer("saved_channel_id")
    .primaryKey()
    .references(() => savedChannels.id, { onDelete: "cascade" }),
  width: integer("width"),
  height: integer("height"),
  // Kept as sent: 59.94 is not 60, and the difference is a broadcast feed
  // against a re-encode.
  frameRate: real("frame_rate"),
  /**
   * What the stream declares, in bits per second — never what a viewing
   * measured.
   *
   * A declared bandwidth is a property of the rendition, so it can be compared
   * between two portals. A measured average is a reading of one network on one
   * evening, and storing it would present that as a fact about the stream.
   */
  bandwidth: integer("bandwidth"),
  /**
   * A reading has to carry its own age. A portal can requantise a channel
   * underneath a stored row, and without this a figure from March looks
   * exactly like one from this morning.
   */
  seenAt: timestamp("seen_at").notNull(),
})

/**
 * Which stream plays when the user opens a channel.
 *
 * Created by scripts/migrate-channel-identities.sql; this is that table reaching
 * the app. `identityKey` is the channel's — "id:<normalized xmltv id>", from
 * identityKeyFor — and never saved_channels.identity_key, which is one portal's
 * name for one of its own rows. The two words mean different things one column
 * apart, so read the table name.
 *
 * Rows point at saved_channels rather than saved_sources because one portal can
 * carry the same channel twice at different qualities, so what is being ordered
 * is streams. Sparse: a row only once someone has actually chosen, and a channel
 * with no rows plays whichever stream the catalogue happens to list first.
 */
export const channelIdentitySourceOrder = pgTable(
  "channel_identity_source_order",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    identityKey: text("identity_key").notNull(),
    savedChannelId: integer("saved_channel_id")
      .notNull()
      .references(() => savedChannels.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.identityKey, table.savedChannelId],
    }),
  ],
)

// The iptv-epg.org channel directory. Public, global, identical for every user;
// a shared cache of a public dataset rather than user data. Refreshed one country
// at a time so each write fits inside a serverless request.
export const epgCountries = pgTable("epg_countries", {
  code: text("code").primaryKey(),
  channelCount: integer("channel_count").notNull().default(0),
  fetchedAt: timestamp("fetched_at").notNull(),
})

export const epgChannels = pgTable(
  "epg_channels",
  {
    countryCode: text("country_code")
      .notNull()
      .references(() => epgCountries.code, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    // Precomputed match keys so channel lookups are an indexed equality probe
    // instead of a full scan + normalize of every row.
    channelIdLower: text("channel_id_lower").notNull(),
    nameNormalized: text("name_normalized").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.countryCode, table.channelId] }),
    index("epg_channels_channel_id_lower_idx").on(table.channelIdLower),
    index("epg_channels_name_normalized_idx").on(table.nameNormalized),
  ],
)

// A user's own custom EPG (XMLTV) sources: a reusable library. Many saved
// sources can point at the same one via savedSources.epgSourceId. The URL is
// encrypted at rest because XMLTV endpoints often embed credentials.
export const userEpgSources = pgTable(
  "user_epg_sources",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: encryptedText("url").notNull(),
    channelCount: integer("channel_count").notNull().default(0),
    refreshedAt: timestamp("refreshed_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("user_epg_sources_user_id_idx").on(table.userId)],
)

// Parsed channel directory for a custom EPG source (mirrors epgChannels). Only
// channel metadata is stored; programmes are fetched on demand from the URL.
export const userEpgChannels = pgTable(
  "user_epg_channels",
  {
    epgSourceId: integer("epg_source_id")
      .notNull()
      .references(() => userEpgSources.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    channelIdLower: text("channel_id_lower").notNull(),
    nameNormalized: text("name_normalized").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.epgSourceId, table.channelId] }),
    index("user_epg_channels_channel_id_lower_idx").on(table.channelIdLower),
    index("user_epg_channels_name_normalized_idx").on(table.nameNormalized),
  ],
)

export const savedPortalsRelations = relations(savedPortals, ({ many }) => ({
  channels: many(savedChannels),
}))

export const savedSourcesRelations = relations(
  savedSources,
  ({ many, one }) => ({
    channels: many(savedChannels),
    stalker: one(savedStalkerSources),
    xtream: one(savedXtreamSources),
    m3u: one(savedM3uSources),
    epgSource: one(userEpgSources, {
      fields: [savedSources.epgSourceId],
      references: [userEpgSources.id],
    }),
  }),
)

export const userEpgSourcesRelations = relations(
  userEpgSources,
  ({ many }) => ({
    channels: many(userEpgChannels),
    sources: many(savedSources),
  }),
)

export const userEpgChannelsRelations = relations(
  userEpgChannels,
  ({ one }) => ({
    epgSource: one(userEpgSources, {
      fields: [userEpgChannels.epgSourceId],
      references: [userEpgSources.id],
    }),
  }),
)

export const savedStalkerSourcesRelations = relations(
  savedStalkerSources,
  ({ one }) => ({
    source: one(savedSources, {
      fields: [savedStalkerSources.sourceId],
      references: [savedSources.id],
    }),
  }),
)

export const savedXtreamSourcesRelations = relations(
  savedXtreamSources,
  ({ one }) => ({
    source: one(savedSources, {
      fields: [savedXtreamSources.sourceId],
      references: [savedSources.id],
    }),
  }),
)

export const savedM3uSourcesRelations = relations(
  savedM3uSources,
  ({ one }) => ({
    source: one(savedSources, {
      fields: [savedM3uSources.sourceId],
      references: [savedSources.id],
    }),
  }),
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const savedChannelsRelations = relations(savedChannels, ({ one }) => ({
  source: one(savedSources, {
    fields: [savedChannels.sourceId],
    references: [savedSources.id],
  }),
  portal: one(savedPortals, {
    fields: [savedChannels.portalId],
    references: [savedPortals.id],
  }),
}))

export type SavedPortal = typeof savedPortals.$inferSelect
export type NewSavedPortal = typeof savedPortals.$inferInsert
export type SavedSource = typeof savedSources.$inferSelect
export type NewSavedSource = typeof savedSources.$inferInsert
export type SavedChannel = typeof savedChannels.$inferSelect
export type NewSavedChannel = typeof savedChannels.$inferInsert
export type Favorite = typeof favorites.$inferSelect
export type NewFavorite = typeof favorites.$inferInsert
export type FavoriteGroup = typeof favoriteGroups.$inferSelect
export type NewFavoriteGroup = typeof favoriteGroups.$inferInsert
export type UserSettings = typeof userSettings.$inferSelect
export type NewUserSettings = typeof userSettings.$inferInsert
export type EpgCountry = typeof epgCountries.$inferSelect
export type NewEpgCountry = typeof epgCountries.$inferInsert
export type EpgChannelRow = typeof epgChannels.$inferSelect
export type NewEpgChannelRow = typeof epgChannels.$inferInsert
export type UserEpgSource = typeof userEpgSources.$inferSelect
export type NewUserEpgSource = typeof userEpgSources.$inferInsert
export type UserEpgChannelRow = typeof userEpgChannels.$inferSelect
export type NewUserEpgChannelRow = typeof userEpgChannels.$inferInsert
