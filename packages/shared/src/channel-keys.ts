import {
  identityKeyFor,
  sourceRank,
  trustedGuideIds,
  IDENTITY_NAME_LIMIT,
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

/**
 * A guide id whose slug says the whole id back.
 *
 * slugify collapses every run of non-alphanumerics to one hyphen, which is what
 * makes the slugs readable and is also the one way they lie: "mgm+.us" and
 * "mgm.us" are different channels and both come out "mgm-us". Measured over a
 * real catalogue that was 93 channels sharing a URL with another channel, and
 * the loser of each pair could not be reached at all -- MGM+ always opened MGM,
 * every row in the list drawing correctly and two of them playing the same
 * stream. Same failure as a portal writing "default" on ten thousand channels,
 * arriving from the other end.
 *
 * Letters, digits and dots only, because the dot is the separator real guide
 * ids use -- "tsn1.ca", "gameshownetwork.us" -- and mapping it to a hyphen is
 * reversible as long as nothing else does. Ids outside this set keep their
 * readable slug and gain a hash of the id, so they stay distinct from the plain
 * one they would otherwise have collided with and from each other.
 */
const PLAIN_GUIDE_ID = /^[a-z0-9]+(?:\.[a-z0-9]+)*$/

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
  trusted: ReadonlySet<string>,
) {
  /**
   * A channel with a guide id that is an identity is that guide id, and
   * nothing else.
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
   *
   * Which is exactly why it has to be an identity and not merely an id. A
   * portal that writes "default" on ten thousand channels was writing a label,
   * not a name, and addressing by it made one of those channels reachable and
   * the rest unreachable — every row in the list drawing correctly and every
   * one of them opening the same stream. identityKeyFor is the test.
   */
  const guideId = identityKeyFor(channel, trusted) ? normalizeXmltvId(channel.xmltvId) : ""
  if (guideId) {
    return guideSlug(guideId)
  }

  // Nothing stable to address it by, so the old form stands: scoped to this
  // user and this portal, because that is genuinely all this channel is. A link
  // to one is not shareable and should not pretend to be.
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

/**
 * The URL form of a guide id: the id itself where that is unambiguous, and the
 * id plus a hash of it where it is not. See PLAIN_GUIDE_ID.
 */
function guideSlug(guideId: string) {
  const slug = slugify(guideId)
  if (!slug) return "channel"
  // Length is checked as well as shape: slugify truncates at 40, and two long
  // ids that agree for 40 characters would collide however plain they are.
  if (PLAIN_GUIDE_ID.test(guideId) && slug.length < 40) return slug
  return `${slug}-${shortHash(guideId)}`
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
  // Computed here rather than passed in: an index is built over a whole
  // catalogue, which is the only scope the question can be answered at, and a
  // caller handing in a set from somewhere else could address a channel
  // differently from the list that links to it.
  const trusted = trustedGuideIds(channels, IDENTITY_NAME_LIMIT)
  const index = new Map<string, T>()
  const rank = new Map<string, number>()
  /**
   * Compatibility spellings, applied once every channel has claimed its own.
   *
   * They cannot be written during the pass. An alias yields to whatever is
   * already in the index, but "already" during a single pass means "earlier in
   * the catalogue" -- so an alias written at row 500 was still sitting on the
   * slug that row 90,000 addresses itself by, and the primary could not take it
   * back: primaries only displace each other on source rank, and a channel with
   * no chosen source ranks last, which is not lower than the nothing an alias
   * left behind. That is how fixing MGM+ took MGM's own URL away and gave it to
   * a channel whose id was "combate..br".
   *
   * Held back to a second pass, every alias competes only with names nobody
   * wanted, which is the whole of what an alias is for.
   */
  const aliases: Array<[string, T]> = []

  for (const channel of channels) {
    const id = channelSlug(channel, userId, trusted)
    const chosen = sourceRank(channel, sourceOrder, trusted)
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
    if (guideId && trusted.has(guideId)) {
      aliases.push([legacyChannelSlug(channel, userId), channel])

      // And the name-prefixed guide form this briefly had in between.
      const named = `${slugify(channel.name || "channel") || "channel"}-${slugify(guideId) || "id"}`
      aliases.push([named, channel])

      /**
       * And the bare slug, for ids that now carry a hash to stay distinct.
       *
       * Only if nothing has claimed it, which means the channel that reads that
       * way plainly keeps it -- "mgm-us" stays MGM, and MGM+ answers to it only
       * where MGM is absent. A link made before the hash existed pointed at
       * whichever of them won, so this is the one that honours it.
       */
      const bare = slugify(guideId)
      if (bare) aliases.push([bare, channel])
    }
  }

  for (const [alias, channel] of aliases) {
    if (!index.has(alias)) index.set(alias, channel)
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
