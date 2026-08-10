/**
 * One channel, several streams.
 *
 * The same channel arrives once per portal, so a catalogue of five sources
 * holds five TSN 1s that differ only in which pipe they came down. Grouping
 * them means the user picks a channel and the app picks a stream, the way a
 * media library picks a file: the stream stops being the thing you browse.
 *
 * Both clients group with this module and nothing else. Same reasoning as
 * channel-keys.ts — a key that drifts between web and mobile would put a user's
 * source ordering on one identity and read it back from another.
 *
 * The numbers quoted below are from scripts/measure-channel-grouping.mjs run
 * over a real 203,130-channel catalogue across 15 sources. Re-run it whenever
 * anything here changes; the thresholds are empirical, not principled.
 */
import { normalizeXmltvId } from "./xmltv-id"

/**
 * Portals prefix names with a country, in whatever punctuation they favour:
 * "CA - TSN 1", "US| CNN", "┃AR┃ …", "[UK] …".
 */
const COUNTRY_PREFIX =
  /^(?:[|｜┃[(]\s*[\p{L}\p{N}]{2,6}\s*[|｜┃\])]|[\p{L}\p{N}]{2,6}\s*[-–|｜┃:])\s*/u

/**
 * Markers describing the feed rather than the channel.
 *
 * Stripping these is the entire point: "TSN 1 HD" and "TSN 1 4K" are one
 * channel at two qualities, which is exactly the pair that should become two
 * sources of one row rather than two rows.
 */
const QUALITY_TOKENS = new Set([
  "4k",
  "8k",
  "uhd",
  "fhd",
  "qhd",
  "hd",
  "sd",
  "hq",
  "lq",
  "hevc",
  "h264",
  "h265",
  "x265",
  "raw",
  "backup",
  "alt",
  "vip",
])

/**
 * Deliberately NOT stripped, though epg-search.ts strips them.
 *
 * That module drops "plus", "tv", "channel" and "feed" as noise, which is right
 * for ranking a search box and wrong for deciding identity: it collapses "TSN"
 * and "TSN Plus" onto one key. A duplicate row is noise a user can ignore; a
 * false merge is a channel they can no longer reach, and they will not notice
 * it went. When the two errors are not symmetric, take the noisy one.
 */

/**
 * Split on anything that is not a letter or a digit, in any script.
 *
 * The ASCII version of this was a catastrophe waiting in the data. Splitting on
 * [^a-z0-9] erases Arabic, Cyrillic, Greek and CJK entirely, so every channel
 * whose name is written in one of them reduced to whatever Latin scraps its
 * prefix carried — 132 unrelated Arabic channels all keyed to "ar" and would
 * have merged into a single row. Unicode classes keep the name.
 */
function tokens(name: string) {
  return name
    .replace(COUNTRY_PREFIX, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** A channel's name reduced to the part that identifies it. */
export function channelNameKey(name: string) {
  return tokens(name)
    .filter((token) => !QUALITY_TOKENS.has(token))
    .join("")
}

/**
 * How many differently-named channels an id may cover before it stops counting
 * as an identity.
 *
 * Guide ids are only as good as the portal that wrote them, and measurement
 * found two ways they go bad. Some portals write a sentinel — "default" alone
 * appeared on 10,338 channels under 4,150 distinct names, so grouping on it
 * would fuse ten thousand unrelated channels into a single row. Others tag
 * every local station with one national id: abc11whas.us covered 119 different
 * ABC affiliates.
 *
 * Both look identical from here, and neither is detectable from the id's shape
 * — ids with a country suffix turned out to be *more* varied than ids without,
 * because the messy ones are the real ids covering regional variants. What does
 * separate them is the group's own statistics.
 *
 * Ten is where the distribution stops being continuous. Groups of 1 to 10
 * distinct names are 28,941 of 28,985 and behave; past it there are 44 groups,
 * and they hold 12,155 channels between them.
 */
export const ID_NAME_LIMIT = 10

export type GroupableChannel = {
  name?: string | null
  xmltvId?: string | null
}

/**
 * Which guide ids in a catalogue are trustworthy enough to group on.
 *
 * Counted across the whole catalogue rather than judged one channel at a time,
 * because a bad id is only visible in company: "default" looks perfectly
 * reasonable until you notice what else is wearing it.
 */
export function trustedGuideIds(channels: Iterable<GroupableChannel>) {
  const names = new Map<string, Set<string>>()

  for (const channel of channels) {
    const id = normalizeXmltvId(channel.xmltvId)
    if (!id) continue
    const seen = names.get(id) ?? new Set<string>()
    seen.add(channelNameKey(channel.name ?? ""))
    names.set(id, seen)
  }

  const trusted = new Set<string>()
  for (const [id, seen] of names) {
    if (seen.size <= ID_NAME_LIMIT) trusted.add(id)
  }
  return trusted
}

export type GroupKey = {
  key: string
  /** Which rule produced it, so the interface can say how sure it is. */
  by: "id" | "name"
}

/**
 * The identity a channel groups under.
 *
 * A trusted guide id wins, because it is the only evidence that came from
 * outside the portal. Otherwise the name, which is a guess, and the interface
 * should present it as one. Channels with neither stay on their own.
 */
export function groupKeyFor(
  channel: GroupableChannel,
  trusted: ReadonlySet<string>,
): GroupKey | null {
  const id = normalizeXmltvId(channel.xmltvId)
  if (id && trusted.has(id)) return { key: `id:${id}`, by: "id" }

  const name = channelNameKey(channel.name ?? "")
  if (name) return { key: `name:${name}`, by: "name" }

  return null
}

export type ChannelGroup<T> = {
  key: string
  by: "id" | "name"
  /** Every channel under this identity, in the order given. */
  members: T[]
}

/**
 * Groups a catalogue, preserving the order channels arrived in.
 *
 * Order matters because it is the caller's: the list is already sorted by
 * whatever the user chose, and a group takes the position of its first member
 * so grouping never reshuffles the page underneath them.
 */
export function groupChannels<T extends GroupableChannel>(
  channels: readonly T[],
): ChannelGroup<T>[] {
  const trusted = trustedGuideIds(channels)
  const groups: ChannelGroup<T>[] = []
  const byKey = new Map<string, ChannelGroup<T>>()

  for (const channel of channels) {
    const identity = groupKeyFor(channel, trusted)
    if (!identity) {
      // No id and no usable name. On its own rather than lumped with every
      // other nameless channel, which is what an empty key would do.
      groups.push({ key: `solo:${groups.length}`, by: "name", members: [channel] })
      continue
    }

    const existing = byKey.get(identity.key)
    if (existing) {
      existing.members.push(channel)
      continue
    }

    const group: ChannelGroup<T> = {
      key: identity.key,
      by: identity.by,
      members: [channel],
    }
    byKey.set(identity.key, group)
    groups.push(group)
  }

  return groups
}
