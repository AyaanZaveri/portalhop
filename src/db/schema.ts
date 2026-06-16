import { relations } from "drizzle-orm"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const savedPortals = sqliteTable("saved_portals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

export const savedChannels = sqliteTable("saved_channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portalId: integer("portal_id")
    .notNull()
    .references(() => savedPortals.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  number: text("number").notNull(),
  name: text("name").notNull(),
  genreId: text("genre_id").notNull(),
  genre: text("genre").notNull(),
  cmd: text("cmd").notNull(),
  logo: text("logo").notNull(),
  logoUrl: text("logo_url").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

export const savedPortalsRelations = relations(savedPortals, ({ many }) => ({
  channels: many(savedChannels),
}))

export const savedChannelsRelations = relations(savedChannels, ({ one }) => ({
  portal: one(savedPortals, {
    fields: [savedChannels.portalId],
    references: [savedPortals.id],
  }),
}))

export type SavedPortal = typeof savedPortals.$inferSelect
export type NewSavedPortal = typeof savedPortals.$inferInsert
export type SavedChannel = typeof savedChannels.$inferSelect
export type NewSavedChannel = typeof savedChannels.$inferInsert
