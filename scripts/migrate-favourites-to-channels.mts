// Rewrites favourites and group memberships that name one portal's copy of a
// channel so they name the channel instead.
//
// A favourite is a statement about a channel. Stored against a copy, it belongs
// to whichever portal happened to be showing that channel when the star was
// pressed: turn that source off and the favourite vanishes, even when four
// other portals still carry it. getFavoriteKey has written the channel's own
// key since favourites stopped belonging to portals, but the rows written
// before that are still per-copy, and they cannot heal themselves — resolving
// one needs its source loaded, and a source being off is exactly the case where
// it is missing.
//
// So this runs where every row is visible at once. Trust is computed per user
// over that user's whole catalogue, the same statistic identityKeyFor uses, so
// a key rewritten here is byte-identical to the one the app would write today.
//
// Rows whose saved channel no longer exists are reported and left alone: they
// point at a row a removed portal took with it and cannot be resolved to
// anything. Deleting them is a separate decision, and this script does not make
// it.
//
// Usage: npx tsx --tsconfig tsconfig.json scripts/migrate-favourites-to-channels.mts [--apply]
import { config } from "dotenv"
config()

import { and, eq } from "drizzle-orm"

import { getDb } from "@/db/client"
import {
  favoriteGroupChannels,
  favoriteGroups,
  favorites,
  savedChannels,
  savedSources,
} from "@/db/schema"
import {
  identityKeyFor,
  trustedGuideIds,
  IDENTITY_NAME_LIMIT,
} from "@portalhop/shared/channel-grouping"

const apply = process.argv.includes("--apply")
const db = getDb()

/** The saved-channel id inside a per-copy key, or null if it is another shape. */
function savedChannelIdOf(channelKey: string) {
  try {
    const parsed = JSON.parse(channelKey)
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "number" &&
      typeof parsed[1] === "number"
    ) {
      return parsed[1]
    }
  } catch {
    // Not JSON: one of the older string forms, which this does not touch.
  }
  return null
}

const favouriteRows = await db
  .select({
    id: favorites.id,
    userId: favorites.userId,
    channelKey: favorites.channelKey,
    position: favorites.position,
  })
  .from(favorites)

const groupRows = await db
  .select({
    groupId: favoriteGroupChannels.favoriteGroupId,
    userId: favoriteGroups.userId,
    channelKey: favoriteGroupChannels.channelKey,
    position: favoriteGroupChannels.position,
  })
  .from(favoriteGroupChannels)
  .innerJoin(favoriteGroups, eq(favoriteGroupChannels.favoriteGroupId, favoriteGroups.id))

const userIds = [
  ...new Set([...favouriteRows, ...groupRows].map((row) => row.userId)),
]

let migrated = 0
let merged = 0
let orphaned = 0

for (const userId of userIds) {
  const channels = await db
    .select({
      id: savedChannels.id,
      xmltvId: savedChannels.xmltvId,
      name: savedChannels.name,
    })
    .from(savedChannels)
    .innerJoin(savedSources, eq(savedChannels.sourceId, savedSources.id))
    .where(eq(savedSources.userId, userId))

  // The identity limit, not the grouping one: this is deciding what a stored
  // row is allowed to be attached to. See IDENTITY_NAME_LIMIT.
  const trusted = trustedGuideIds(channels, IDENTITY_NAME_LIMIT)
  const identityOf = new Map(
    channels.map((channel) => [channel.id, identityKeyFor(channel, trusted)]),
  )

  const mine = favouriteRows.filter((row) => row.userId === userId)
  const held = new Set(mine.map((row) => row.channelKey))

  for (const row of mine) {
    const savedChannelId = savedChannelIdOf(row.channelKey)
    if (savedChannelId === null) continue

    if (!identityOf.has(savedChannelId)) {
      orphaned++
      console.log(`  orphan   ${userId.slice(0, 6)} ${row.channelKey} (saved channel ${savedChannelId} is gone)`)
      continue
    }

    const identityKey = identityOf.get(savedChannelId)
    if (!identityKey) continue

    // Two portals' copies of one channel collapse onto one key, and the same
    // channel may already be favourited under it. The earlier row wins, since
    // position is the user's ordering and the first is where they put it.
    if (held.has(identityKey)) {
      merged++
      console.log(`  merge    ${userId.slice(0, 6)} ${row.channelKey} -> ${identityKey}`)
      if (apply) {
        await db.delete(favorites).where(eq(favorites.id, row.id))
      }
      continue
    }

    held.add(identityKey)
    migrated++
    console.log(`  rewrite  ${userId.slice(0, 6)} ${row.channelKey} -> ${identityKey}`)
    if (apply) {
      await db
        .update(favorites)
        .set({ channelKey: identityKey })
        .where(eq(favorites.id, row.id))
    }
  }

  const myGroups = groupRows.filter((row) => row.userId === userId)
  const heldInGroup = new Map<number, Set<string>>()
  for (const row of myGroups) {
    const keys = heldInGroup.get(row.groupId) ?? new Set<string>()
    keys.add(row.channelKey)
    heldInGroup.set(row.groupId, keys)
  }

  for (const row of myGroups) {
    const savedChannelId = savedChannelIdOf(row.channelKey)
    if (savedChannelId === null) continue

    if (!identityOf.has(savedChannelId)) {
      orphaned++
      console.log(`  orphan   ${userId.slice(0, 6)} group ${row.groupId} ${row.channelKey}`)
      continue
    }

    const identityKey = identityOf.get(savedChannelId)
    if (!identityKey) continue

    const keys = heldInGroup.get(row.groupId) ?? new Set<string>()
    const where = and(
      eq(favoriteGroupChannels.favoriteGroupId, row.groupId),
      eq(favoriteGroupChannels.channelKey, row.channelKey),
    )

    if (keys.has(identityKey)) {
      merged++
      console.log(`  merge    ${userId.slice(0, 6)} group ${row.groupId} ${row.channelKey} -> ${identityKey}`)
      if (apply) await db.delete(favoriteGroupChannels).where(where)
      continue
    }

    keys.add(identityKey)
    heldInGroup.set(row.groupId, keys)
    migrated++
    console.log(`  rewrite  ${userId.slice(0, 6)} group ${row.groupId} ${row.channelKey} -> ${identityKey}`)
    if (apply) {
      await db
        .update(favoriteGroupChannels)
        .set({ channelKey: identityKey })
        .where(where)
    }
  }
}

console.log(
  `\n${apply ? "applied" : "dry run"}: ${migrated} rewritten, ${merged} merged into an existing favourite, ${orphaned} left alone (their saved channel is gone)`,
)

if (!apply) console.log("re-run with --apply to write.")

process.exit(0)
