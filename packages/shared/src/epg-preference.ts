// Which of a channel's streams supplies its guide.
//
// A channel arrives once from every source that carries it, and each of those
// sources has its own idea of where a schedule comes from -- one reads
// iptv-org, the next serves its own, a third points at an XMLTV file the user
// added. They are all describing the same broadcast. Reading whichever stream
// happens to be playing therefore meant the schedule changed when the picture
// did not, and a channel carried by eight sources needed its guide corrected
// eight times, on whichever copy happened to be ranked first.
//
// This module answers the question once per channel. Shared between client and
// server; keep it free of server-only imports.

import type { EpgMode } from "./source-types"

/** An EPG mode that can actually supply a schedule. */
export type EpgKind = Exclude<EpgMode, "none">

export const EPG_KINDS: readonly EpgKind[] = ["iptv-org", "custom", "portal"]

/**
 * The order guides are preferred in, best first.
 *
 * Ranked by what kind of guide it is rather than by which stream plays, and
 * that distinction is the whole point: choosing a stream is a judgement about
 * picture quality and reliability, choosing a guide is a judgement about data.
 * Tying them together meant dragging a source to the top to get a better
 * picture silently swapped the schedule underneath it.
 *
 * iptv-org first because it is one curated dataset covering everything, so a
 * catalogue resolved against it is consistent channel to channel and shares a
 * single fetch per country. A source's own guide last because its quality is
 * the most variable thing here -- though it still wins for the channels only
 * that source carries, which is most of why it is in the list at all.
 *
 * The user can reorder these; see UserSettingsData.epgKindOrder.
 */
export const DEFAULT_EPG_KIND_ORDER: readonly EpgKind[] = [
  "iptv-org",
  "custom",
  "portal",
]

/** Coerces stored or posted input into a complete, duplicate-free kind order. */
export function sanitizeEpgKindOrder(value: unknown): EpgKind[] {
  const listed = Array.isArray(value)
    ? value.filter((kind): kind is EpgKind =>
        EPG_KINDS.includes(kind as EpgKind),
      )
    : []

  // Completed rather than rejected. A short list is what an older client or a
  // hand-written patch sends, and dropping the kinds it forgot would leave
  // those channels with no guide at all rather than with a lower-ranked one.
  const seen = new Set(listed)
  return [...new Set(listed), ...DEFAULT_EPG_KIND_ORDER.filter((k) => !seen.has(k))]
}

/** The parts of a stream that decide whether it can supply a guide. */
export type EpgStream = {
  id?: string | null
  name?: string | null
  xmltvId?: string | null
  savedChannelId?: number | null
  portalSource?: {
    id: number
    name?: string
    epgMode: EpgMode
    epgSourceId: number | null
  } | null
}

/**
 * Whether this stream can be asked for a schedule at all.
 *
 * The id-based kinds need a guide id: they look the channel up in a file by it,
 * and without one there is nothing to look up. A source's own guide is asked
 * for by the channel's id within that source, which every stream from a source
 * has -- which is why an unmatched channel on a Stalker portal still shows a
 * schedule while the same channel on an M3U source shows nothing.
 */
export function canSupplyEpg(stream: EpgStream): boolean {
  const mode = stream.portalSource?.epgMode
  if (!mode || mode === "none") return false
  if (mode === "portal") return Boolean(stream.id || stream.name)
  if (mode === "custom") {
    return Boolean(stream.xmltvId && stream.portalSource?.epgSourceId)
  }
  return Boolean(stream.xmltvId)
}

export type EpgChoice = {
  /** The stream whose source supplies the schedule. */
  stream: EpgStream
  /** True when the user pinned this one rather than the ranking picking it. */
  pinned: boolean
}

/**
 * Which stream supplies this channel's guide.
 *
 * `streams` must already be in the channel's own source order -- the same list
 * the sources drawer shows -- because that order is the tie-break when two
 * streams offer the same kind of guide. Ranking decides first, so reordering
 * streams within a kind is the only reordering that can move the guide.
 *
 * A pin wins outright, but only while it still refers to a stream this channel
 * has and that can answer. A pinned source the user later deleted leaves the
 * channel on the ranking rather than with no guide, which is the same way a
 * favourite whose channel is gone is dropped rather than shown broken.
 */
export function resolveChannelEpg(
  streams: readonly EpgStream[],
  options: {
    kindOrder?: readonly EpgKind[]
    /** saved_channels.id the user pinned for this channel, if any. */
    pinnedSavedChannelId?: number | null
  } = {},
): EpgChoice | null {
  const pinnedId = options.pinnedSavedChannelId
  if (typeof pinnedId === "number") {
    // A manual choice is intentional. Falling through here would quietly show
    // a different guide after a provider goes stale, which is exactly the
    // surprise pinning is meant to avoid. Reset is the explicit way back to
    // automatic ranking.
    const pinned = streams.find((stream) => stream.savedChannelId === pinnedId)
    return pinned && canSupplyEpg(pinned) ? { stream: pinned, pinned: true } : null
  }

  const usable = streams.filter(canSupplyEpg)
  if (!usable.length) return null

  const order = options.kindOrder?.length
    ? sanitizeEpgKindOrder(options.kindOrder)
    : DEFAULT_EPG_KIND_ORDER

  const rankOf = (stream: EpgStream) => {
    const index = order.indexOf(stream.portalSource?.epgMode as EpgKind)
    return index === -1 ? order.length : index
  }

  // Stable, so streams of equally-ranked kinds keep the channel's source order.
  let best = usable[0]
  let bestRank = rankOf(best)
  for (const stream of usable.slice(1)) {
    const rank = rankOf(stream)
    if (rank < bestRank) {
      best = stream
      bestRank = rank
    }
  }

  return { stream: best, pinned: false }
}

/**
 * The identity of a resolved guide, for cache keys and effect dependencies.
 *
 * Two streams of one channel that resolve to the same guide produce the same
 * string, which is what lets switching source leave the schedule alone instead
 * of refetching an identical one.
 */
export function epgChoiceKey(choice: EpgChoice | null): string {
  if (!choice) return ""
  const { stream } = choice
  const mode = stream.portalSource?.epgMode ?? "none"
  if (mode === "portal") {
    return `portal:${stream.portalSource?.id ?? 0}:${stream.id ?? ""}`
  }
  if (mode === "custom") {
    return `custom:${stream.portalSource?.epgSourceId ?? 0}:${stream.xmltvId ?? ""}`
  }
  return `${mode}:${stream.xmltvId ?? ""}`
}
