"use client"

import { useSearchParams } from "next/navigation"

// The selected channel rides in a query param rather than a path segment. A
// path segment would need `generateStaticParams` to survive `output: export`,
// and channel ids only exist at runtime — there is nothing to enumerate at
// build time. A query param keeps a single /tv document serving every channel,
// which is what the packaged mobile app can actually load off disk.
export const channelSearchParam = "channel"
/** A one-time source choice for the current channel view. */
export const channelSourceSearchParam = "source"

/** Slug of the channel currently being viewed, or undefined on the list view. */
export function useActiveChannelSlug(): string | undefined {
  const searchParams = useSearchParams()
  return searchParams.get(channelSearchParam) ?? undefined
}

/**
 * The saved-channel row picked from the Sources drawer, if any.
 *
 * This deliberately lives in the URL rather than the user's source ordering:
 * choosing a stream is for this viewing session; dragging is what changes the
 * default source for future visits.
 */
export function useActiveChannelSourceId(): number | undefined {
  const searchParams = useSearchParams()
  const source = Number(searchParams.get(channelSourceSearchParam))
  return Number.isSafeInteger(source) && source > 0 ? source : undefined
}

/** Href for a channel's detail view. */
export function channelHref(slug: string, sourceId?: number) {
  const params = new URLSearchParams({ [channelSearchParam]: slug })
  if (
    typeof sourceId === "number" &&
    Number.isSafeInteger(sourceId) &&
    sourceId > 0
  ) {
    params.set(channelSourceSearchParam, String(sourceId))
  }
  return `/tv?${params.toString()}`
}
