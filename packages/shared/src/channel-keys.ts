import {
  sourceRank,
  type ChannelSourceOrder,
} from "./channel-grouping"
import type { PortalChannel } from "./stalker-types"
import { normalizeXmltvId } from "./xmltv-id"

// Channel identity, shared by both frontends. These values end up in favourites
// rows and in deep links, so the two clients must agree byte for byte — a drift
// here would silently orphan someone's favourites or break their saved links.

/** The minimum a channel needs to be identifiable; both apps widen this. */
export type ChannelWithSourceId = PortalChannel & {
  portalSource?: { id: number }
}

export function getChannelKey(channel: ChannelWithSourceId) {
  // Saved channels retain this row ID across portal refreshes. Keeping the
  // favorite key to these two durable values avoids mutable provider metadata
  // (number, name, stream URL) making a favorite disappear.
  if (
    typeof channel.portalSource?.id === "number" &&
    typeof channel.savedChannelId === "number"
  ) {
    return JSON.stringify([channel.portalSource.id, channel.savedChannelId])
  }

  // Channel IDs from older saved M3U sources can be XMLTV `tvg-id` values,
  // which are not necessarily unique. Include the stream URL and playlist
  // number so selection, favourites, and player state identify the actual
  // stream rather than its guide metadata.
  return JSON.stringify([
    channel.portalSource?.id ?? "manual",
    channel.savedChannelId ?? null,
    channel.id,
    channel.number,
    channel.cmd,
  ])
}

/**
 * The key a favourite is stored under.
 *
 * A favourite is a statement about a channel, not about one portal's copy of
 * it. Keyed per copy — which is what getChannelKey gives — favouriting TSN 1
 * from two portals makes two favourites, and dropping the portal the favourite
 * happened to be made from loses it even though four others still carry the
 * channel. That is the failure AGENTS.md describes as looking like favourites
 * not syncing.
 *
 * So a channel with a guide id is favourited under that id. It survives a
 * portal being removed, refreshed away, or renamed, because none of those
 * touch the guide.
 *
 * A channel without one falls back to the per-copy key, unchanged. That is 62%
 * of a real catalogue, so this is a fallback in the ordinary case rather than
 * an edge: there is nothing else stable to hang it from, and inventing one from
 * the name would detach the moment a portal renamed the channel.
 *
 * Readers must accept both. A channel that later gains a guide id — from the
 * enrichment pass, or someone picking the match by hand — changes key, and a
 * reader that only knew the new one would drop the favourite at exactly that
 * moment. See isFavoriteKeyed.
 */
export function getFavoriteKey(
  channel: ChannelWithSourceId,
  identityKey: string | null,
) {
  return identityKey ?? getChannelKey(channel)
}

/**
 * Whether a channel is favourited, under either key it might carry.
 *
 * Both are checked on every read rather than migrating rows once, because the
 * two keys are not alternatives in time — a catalogue holds channels of both
 * kinds permanently, and any one channel can move between them.
 */
export function isFavoriteKeyed(
  channel: ChannelWithSourceId,
  identityKey: string | null,
  has: (key: string) => boolean,
) {
  if (identityKey && has(identityKey)) return true
  return has(getChannelKey(channel))
}

export function getLegacyChannelKey(channel: ChannelWithSourceId) {
  return [
    channel.portalSource?.id ?? "manual",
    channel.id || channel.number || channel.name,
  ].join(":")
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

/** FNV-1a. Short, stable, and not security-sensitive — this is a URL id. */
function shortHash(input: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

// Mirrors getChannelKey's uniqueness rules for iptv-org / m3u sources.
function channelIdentity(channel: ChannelWithSourceId) {
  if (channel.savedChannelId != null) {
    return `s${channel.savedChannelId}`
  }
  return [
    normalizeXmltvId(channel.xmltvId) || channel.id,
    channel.number,
    channel.cmd,
  ].join("|")
}

/**
 * URL id for a channel: a readable name slug plus a short hash tied to the user,
 * the portal, and the channel identity (not its category), so it is unique
 * across portals and users and scoped per user.
 */
export function channelSlug(
  channel: ChannelWithSourceId,
  userId: string | null,
) {
  /**
   * A channel with a guide id is that guide id, and nothing else.
   *
   * The URL then names the channel rather than one portal's copy of it, which
   * is what makes it survive: reordering sources, dropping the portal it was
   * first opened from, or a refresh renumbering the catalogue all leave it
   * pointing at the same thing. The old form hashed the user, the portal and
   * the row, so it broke on all three.
   *
   * No name in front of it either. A name is per-portal — "SKY SPORTS F1 UHD"
   * against "4K| SKY SPORTS F1" — so prefixing it gave the same channel a
   * different URL depending on which portal's copy the link was made from,
   * which is the per-copy addressing this was meant to end. No hash: the guide
   * id is already unique and already readable, and hashing it would only hide
   * which channel the link is for.
   */
  const guideId = normalizeXmltvId(channel.xmltvId)
  if (guideId) {
    return slugify(guideId) || "channel"
  }

  // No guide id, so there is nothing stable to address it by and the old form
  // stands: scoped to this user and this portal, because that is genuinely all
  // this channel is. A link to one is not shareable and should not pretend to
  // be.
  const name = slugify(channel.name || channel.number || "channel") || "channel"
  const hash = shortHash(
    [
      userId ?? "anon",
      channel.portalSource?.id ?? "manual",
      channelIdentity(channel),
    ].join("|"),
  )
  return `${name}-${hash}`
}

/** Lookup from URL id -> channel, for O(1) resolution of a deep link. */
export function buildChannelIndex<T extends ChannelWithSourceId>(
  channels: T[],
  userId: string | null,
  /**
   * The user's chosen stream per channel. Without it the first copy in the
   * catalogue wins, which is arbitrary — a guide-id slug names the channel, and
   * several portals carry it. With it, following a link plays the same stream
   * the sources drawer shows at the top, which is what makes the choice real
   * rather than a label on a list.
   */
  sourceOrder: ChannelSourceOrder = {},
) {
  const index = new Map<string, T>()
  const rank = new Map<string, number>()

  for (const channel of channels) {
    const id = channelSlug(channel, userId)
    const chosen = sourceRank(channel, sourceOrder)
    if (!index.has(id) || chosen < (rank.get(id) ?? Number.MAX_SAFE_INTEGER)) {
      index.set(id, channel)
      rank.set(id, chosen)
    }

    /**
     * Old links keep working.
     *
     * Every channel with a guide id used to have a per-user, per-portal slug,
     * and those are in bookmarks and in whatever anyone pasted somewhere. They
     * are indexed alongside the new form rather than migrated, because there is
     * nothing to migrate: a URL someone saved is not ours to rewrite.
     */
    const guideId = normalizeXmltvId(channel.xmltvId)
    if (guideId) {
      const legacy = legacyChannelSlug(channel, userId)
      if (!index.has(legacy)) index.set(legacy, channel)

      // And the name-prefixed guide form this briefly had in between.
      const named = `${slugify(channel.name || "channel") || "channel"}-${slugify(guideId) || "id"}`
      if (!index.has(named)) index.set(named, channel)
    }
  }
  return index
}

/** The slug a guide-id channel had before it was addressed by that id. */
function legacyChannelSlug(
  channel: ChannelWithSourceId,
  userId: string | null,
) {
  const name = slugify(channel.name || channel.number || "channel") || "channel"
  const hash = shortHash(
    [
      userId ?? "anon",
      channel.portalSource?.id ?? "manual",
      channelIdentity(channel),
    ].join("|"),
  )
  return `${name}-${hash}`
}
