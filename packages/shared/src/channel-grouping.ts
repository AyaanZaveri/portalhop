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

/**
 * The same question, asked for identity rather than for grouping, and answered
 * with a looser number.
 *
 * Merging and addressing are not the same risk. A group that merges two
 * channels shows one row where there should be two, which the user can see and
 * work around; an identity that covers two channels gives them one URL, one
 * favourite and one default source between them, and the second channel simply
 * cannot be reached. So grouping stays tight and identity — where a false
 * positive is unrecoverable — would seem to want tighter still.
 *
 * It wants looser, because the errors are the other way round. Being denied an
 * identity costs a channel a shareable link and the ability to remember a
 * source; it still groups, still plays, still favourites under its per-copy
 * key. Ten is too tight for that: measured across three live catalogues,
 * skysportsf1.uk wears 14 distinct names across 23 streams and svt1.se 14
 * across 17, purely because portals write "4K| SKY SPORTS F1" and "SKY SPORTS
 * F1 UHD" and the tokenizer only strips the quality tokens it knows.
 *
 * The distribution here is continuous — 14, 15, 16, 18, 19, 20, 24, 27, 28, 32,
 * 43, 50, 60, 69, 72, 106, 119, 178, 197, 4124 — so this is a judgement about
 * where real channels stop and labels begin, not a boundary the data draws by
 * itself. Twenty-five sits in the widest gap below the sentinels: it keeps
 * every id in that list up to rai3.it at 24, and rejects everything from
 * ballysportsflorida.us at 27 upward. Re-measure with
 * scripts/measure-channel-grouping.mjs when the tokenizer changes, because a
 * better tokenizer moves real channels down and leaves the labels where they
 * are.
 */
export const IDENTITY_NAME_LIMIT = 25

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
export function trustedGuideIds(
  channels: Iterable<GroupableChannel>,
  /** ID_NAME_LIMIT to decide grouping, IDENTITY_NAME_LIMIT to decide identity. */
  limit: number = ID_NAME_LIMIT,
) {
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
    if (seen.size <= limit) trusted.add(id)
  }
  return trusted
}

/**
 * The identity a stored preference or a URL may be attached to, or null.
 *
 * Gated on the same trust the grouping uses, and it took a real catalogue to
 * show why. This used to anchor on the guide id merely being *present*, on the
 * reasoning that trust is a whole-catalogue statistic and a stored row should
 * not move because someone subscribed to something new. That is a real cost,
 * and it is the smaller one: measured across three accounts, 18% of the largest
 * catalogue sits behind an id that fails the test — "default" alone is 10,203
 * channels under 4,124 distinct names. Anchoring on presence hands all 10,203
 * of them one identity, so favouriting one favourites every one of them, a
 * source chosen for one is chosen for all, and every one of them addresses the
 * same URL — which is what made 10,202 channels unreachable in a list that was
 * otherwise drawing them correctly.
 *
 * Demotion, the case this used to protect, is confined to ids sitting near the
 * threshold. A sentinel is nowhere near it.
 *
 * Returning null is the honest answer for a channel with no usable identity —
 * no guide id, or one that turns out to be a label rather than a name. It still
 * groups, by name, and it still fails over at runtime; there is simply nothing
 * stable to hang a saved preference or a shareable link from, and the interface
 * says so rather than saving something that quietly applies to thousands of
 * other channels.
 */
export function identityKeyFor(
  channel: GroupableChannel,
  trusted: ReadonlySet<string>,
): string | null {
  const id = normalizeXmltvId(channel.xmltvId)
  return id && trusted.has(id) ? `id:${id}` : null
}

/**
 * A user's saved answer to "which of these streams plays": identity key ->
 * saved channel ids, most preferred first. Sparse, and every key is an id: key.
 */
export type ChannelSourceOrder = Readonly<Record<string, readonly number[]>>

export type ChosenSourceChannel = GroupableChannel & {
  savedChannelId?: number | null
}

/**
 * Where a stream sits in its channel's saved order.
 *
 * Anything unchosen sorts last as a group rather than in some invented order:
 * the catalogue's own sequence is what the user saw before they chose, so
 * leaving it alone means choosing one stream reorders exactly one stream.
 */
export function sourceRank(
  channel: ChosenSourceChannel,
  order: ChannelSourceOrder,
  trusted: ReadonlySet<string>,
) {
  const identityKey = identityKeyFor(channel, trusted)
  if (!identityKey || channel.savedChannelId == null) {
    return Number.MAX_SAFE_INTEGER
  }

  const chosen = order[identityKey]
  if (!chosen) return Number.MAX_SAFE_INTEGER

  const position = chosen.indexOf(channel.savedChannelId)
  return position === -1 ? Number.MAX_SAFE_INTEGER : position
}

/**
 * The streams of one channel, most preferred first.
 *
 * Sort is stable, so streams the user never ranked keep the order they arrived
 * in. Used for both what the row plays and what the sources drawer lists, so
 * the drawer is showing the decision rather than describing it.
 */
export function orderByChosenSource<T extends ChosenSourceChannel>(
  members: readonly T[],
  order: ChannelSourceOrder,
  trusted: ReadonlySet<string>,
): T[] {
  return [...members].sort(
    (a, b) => sourceRank(a, order, trusted) - sourceRank(b, order, trusted),
  )
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
 * A correction the user made to where one portal's copy of a channel sits.
 *
 * Keyed on the individual channel rather than on the group, because that is
 * what the statement is about: this copy does not belong with those, or this
 * copy belongs with that identity whatever the key says. Grouping is a guess
 * and will sometimes be wrong; this is how someone tells it so, and it has to
 * outlive any retuning of the guess.
 */
export type GroupOverride =
  /** Stand alone, whatever the key says. Undoes a false merge. */
  | { mode: "detach" }
  /** Join this identity, whatever the key says. Must be an id: key. */
  | { mode: "attach"; identityKey: string }

/**
 * Groups a catalogue, preserving the order channels arrived in.
 *
 * Order matters because it is the caller's: the list is already sorted by
 * whatever the user chose, and a group takes the position of its first member
 * so grouping never reshuffles the page underneath them.
 *
 * Overrides are consulted before the key is computed rather than applied to
 * the finished groups. Applied afterwards, detaching a channel would leave it
 * ordered by where its old group sat instead of where it belongs on its own,
 * and the fix would be to re-sort — which is the one thing this function must
 * not do.
 */
export function groupChannels<T extends GroupableChannel>(
  channels: readonly T[],
  /** Per-channel corrections, looked up by whatever key the caller stores. */
  overrides?: {
    get: (channel: T) => GroupOverride | undefined
  },
): ChannelGroup<T>[] {
  const trusted = trustedGuideIds(channels)
  const groups: ChannelGroup<T>[] = []
  const byKey = new Map<string, ChannelGroup<T>>()

  for (const channel of channels) {
    const override = overrides?.get(channel)

    if (override?.mode === "detach") {
      // Solo, and deliberately under a key nothing else can reach: a detached
      // channel that kept its computed key would be re-merged by the next one
      // to arrive.
      groups.push({
        key: `solo:${groups.length}`,
        by: "name",
        members: [channel],
      })
      continue
    }

    const identity =
      override?.mode === "attach"
        ? { key: override.identityKey, by: "id" as const }
        : groupKeyFor(channel, trusted)

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
