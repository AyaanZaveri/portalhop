import { relations } from "drizzle-orm"
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

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

export const savedChannels = pgTable("saved_channels", {
  id: serial("id").primaryKey(),
  portalId: integer("portal_id")
    .notNull()
    .references(() => savedPortals.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  xmltvId: text("xmltv_id").notNull().default(""),
  number: text("number").notNull(),
  name: text("name").notNull(),
  genreId: text("genre_id").notNull(),
  genre: text("genre").notNull(),
  cmd: text("cmd").notNull(),
  logo: text("logo").notNull(),
  logoUrl: text("logo_url").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const savedPortalsRelations = relations(savedPortals, ({ many }) => ({
  channels: many(savedChannels),
}))

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
  portal: one(savedPortals, {
    fields: [savedChannels.portalId],
    references: [savedPortals.id],
  }),
}))

export type SavedPortal = typeof savedPortals.$inferSelect
export type NewSavedPortal = typeof savedPortals.$inferInsert
export type SavedChannel = typeof savedChannels.$inferSelect
export type NewSavedChannel = typeof savedChannels.$inferInsert
