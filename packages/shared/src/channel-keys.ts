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
) {
  const index = new Map<string, T>()
  for (const channel of channels) {
    const id = channelSlug(channel, userId)
    if (!index.has(id)) index.set(id, channel)
  }
  return index
}
