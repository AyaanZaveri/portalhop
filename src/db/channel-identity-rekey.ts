import { and, eq, inArray, ne, sql } from "drizzle-orm"

import {
  channelIdentitySourceOrder,
  favoriteGroupChannels,
  favoriteGroups,
  favorites,
  savedChannels,
  savedSources,
} from "@/db/schema"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"

type Db = ReturnType<typeof import("@/db/client").getDb>

/**
 * Carries a channel's saved rows across a change of guide id.
 *
 * Everything the user has said about a channel -- that it is a favourite, that
 * it belongs in a group they made, which of its streams plays, which supplies
 * its schedule -- is stored under `id:<guide id>` when the channel has one. So
 * correcting a wrong match, which is a statement about *metadata*, silently
 * moved the channel out from under every one of those rows: it left the group
 * it was put in, and the group went on counting it, because a membership row
 * naming an identity nothing answers to any more is invisible to the list and
 * still very much in the table.
 *
 * Reassigning a guide id says nothing about whether a channel is a favourite.
 * So the rows move with it.
 *
 * Clearing the id has nowhere to move to -- there is no identity left -- so the
 * rows fall back to the per-copy key, which is the same key the channel would
 * have been favourited under had it never had a guide id in the first place.
 * Only the favourite-shaped rows can make that trip; a source order and a guide
 * pin are statements about a channel with several streams, which is exactly
 * what a channel without an identity is not.
 */
export async function rekeyChannelIdentity(
  db: Db,
  userId: string,
  params: {
    sourceId: number
    savedChannelId: number
    previousXmltvId: string
    nextXmltvId: string
  },
): Promise<void> {
  const previous = normalizeXmltvId(params.previousXmltvId)
  const next = normalizeXmltvId(params.nextXmltvId)

  if (previous === next) return

  // Nothing was stored under an identity, so nothing has moved. A channel with
  // no guide id is keyed per copy, and the per-copy key is source id plus row
  // id -- neither of which this touches.
  if (!previous) return

  const oldKey = `id:${previous}`
  const newKey = next
    ? `id:${next}`
    : JSON.stringify([params.sourceId, params.savedChannelId])

  /**
   * Whether the identity this stream is leaving still has streams in it.
   *
   * An identity is shared: eight portals carrying one channel are eight rows
   * with one guide id between them. Reassigning one of them moves that stream
   * alone, so the old identity is still a channel in its own right and must
   * keep everything that was said about it. Only when the last stream leaves is
   * there nothing left to keep the rows for.
   */
  const [stillShared] = await db
    .select({ id: savedChannels.id })
    .from(savedChannels)
    .innerJoin(savedSources, eq(savedSources.id, savedChannels.sourceId))
    .where(
      and(
        eq(savedSources.userId, userId),
        eq(savedChannels.xmltvId, previous),
        ne(savedChannels.id, params.savedChannelId),
      ),
    )
    .limit(1)

  const abandoned = !stillShared

  await carryFavorites(db, userId, oldKey, newKey, abandoned)
  await carryGroupMemberships(db, userId, oldKey, newKey, abandoned)

  // Both of these are answers to "which of this channel's streams", which a
  // channel with no identity does not have. Dropped rather than carried when
  // the id is cleared, and only once nothing answers to the old identity.
  if (!next) {
    if (abandoned) await dropIdentityRows(db, userId, oldKey)
    return
  }

  await carrySourceOrder(db, userId, oldKey, newKey, abandoned)
  await carryGuidePin(db, userId, oldKey, newKey, abandoned)
}

async function carryFavorites(
  db: Db,
  userId: string,
  oldKey: string,
  newKey: string,
  abandoned: boolean,
) {
  const [existing] = await db
    .select({ position: favorites.position, createdAt: favorites.createdAt })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.channelKey, oldKey)))
    .limit(1)

  if (!existing) return

  // Position and creation time come along, so a favourite keeps its place in a
  // hand-ordered list rather than reappearing at the end.
  await db
    .insert(favorites)
    .values({
      userId,
      channelKey: newKey,
      position: existing.position,
      createdAt: existing.createdAt,
    })
    .onConflictDoNothing({
      target: [favorites.userId, favorites.channelKey],
    })

  if (abandoned) {
    await db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.channelKey, oldKey)))
  }
}

async function carryGroupMemberships(
  db: Db,
  userId: string,
  oldKey: string,
  newKey: string,
  abandoned: boolean,
) {
  const groupIds = await db
    .select({ id: favoriteGroups.id })
    .from(favoriteGroups)
    .where(eq(favoriteGroups.userId, userId))

  if (!groupIds.length) return

  const ids = groupIds.map((group) => group.id)

  const memberships = await db
    .select({
      favoriteGroupId: favoriteGroupChannels.favoriteGroupId,
      position: favoriteGroupChannels.position,
      createdAt: favoriteGroupChannels.createdAt,
    })
    .from(favoriteGroupChannels)
    .where(
      and(
        inArray(favoriteGroupChannels.favoriteGroupId, ids),
        eq(favoriteGroupChannels.channelKey, oldKey),
      ),
    )

  if (!memberships.length) return

  // One row per group: a channel in three groups holds a separate position in
  // each, and all three follow it.
  await db
    .insert(favoriteGroupChannels)
    .values(
      memberships.map((membership) => ({
        favoriteGroupId: membership.favoriteGroupId,
        channelKey: newKey,
        position: membership.position,
        createdAt: membership.createdAt,
      })),
    )
    .onConflictDoNothing({
      target: [
        favoriteGroupChannels.favoriteGroupId,
        favoriteGroupChannels.channelKey,
      ],
    })

  if (abandoned) {
    await db
      .delete(favoriteGroupChannels)
      .where(
        and(
          inArray(favoriteGroupChannels.favoriteGroupId, ids),
          eq(favoriteGroupChannels.channelKey, oldKey),
        ),
      )
  }
}

async function carrySourceOrder(
  db: Db,
  userId: string,
  oldKey: string,
  newKey: string,
  abandoned: boolean,
) {
  const rows = await db
    .select({
      savedChannelId: channelIdentitySourceOrder.savedChannelId,
      position: channelIdentitySourceOrder.position,
    })
    .from(channelIdentitySourceOrder)
    .where(
      and(
        eq(channelIdentitySourceOrder.userId, userId),
        eq(channelIdentitySourceOrder.identityKey, oldKey),
      ),
    )

  if (!rows.length) return

  await db
    .insert(channelIdentitySourceOrder)
    .values(
      rows.map((row) => ({
        userId,
        identityKey: newKey,
        savedChannelId: row.savedChannelId,
        position: row.position,
      })),
    )
    .onConflictDoNothing({
      target: [
        channelIdentitySourceOrder.userId,
        channelIdentitySourceOrder.identityKey,
        channelIdentitySourceOrder.savedChannelId,
      ],
    })

  if (abandoned) {
    await db
      .delete(channelIdentitySourceOrder)
      .where(
        and(
          eq(channelIdentitySourceOrder.userId, userId),
          eq(channelIdentitySourceOrder.identityKey, oldKey),
        ),
      )
  }
}

/**
 * The per-channel guide pin, and whatever else channel_identity_prefs carries.
 *
 * Raw SQL because the table is wider than the drizzle model: epg_mode,
 * epg_source_id and display_name are all from earlier designs and none of them
 * are declared, so a select-then-insert through drizzle would carry the row
 * over and quietly drop the name the user chose for the channel. `select *`
 * with the key substituted moves the whole row whatever is on it.
 */
async function carryGuidePin(
  db: Db,
  userId: string,
  oldKey: string,
  newKey: string,
  abandoned: boolean,
) {
  await db.execute(sql`
    insert into channel_identity_prefs (
      user_id, identity_key, epg_mode, epg_source_id,
      display_name, updated_at, epg_saved_channel_id
    )
    select
      user_id, ${newKey}, epg_mode, epg_source_id,
      display_name, updated_at, epg_saved_channel_id
    from channel_identity_prefs
    where user_id = ${userId} and identity_key = ${oldKey}
    on conflict (user_id, identity_key) do nothing
  `)

  if (abandoned) {
    await db.execute(sql`
      delete from channel_identity_prefs
      where user_id = ${userId} and identity_key = ${oldKey}
    `)
  }
}

/** Drops what cannot follow a channel that no longer has an identity. */
async function dropIdentityRows(db: Db, userId: string, oldKey: string) {
  await db
    .delete(channelIdentitySourceOrder)
    .where(
      and(
        eq(channelIdentitySourceOrder.userId, userId),
        eq(channelIdentitySourceOrder.identityKey, oldKey),
      ),
    )

  await db.execute(sql`
    delete from channel_identity_prefs
    where user_id = ${userId} and identity_key = ${oldKey}
  `)
}
