"use client"

import { useSearchParams } from "next/navigation"

// The selected channel rides in a query param rather than a path segment. A
// path segment would need `generateStaticParams` to survive `output: export`,
// and channel ids only exist at runtime — there is nothing to enumerate at
// build time. A query param keeps a single /tv document serving every channel,
// which is what the packaged mobile app can actually load off disk.
export const channelSearchParam = "channel"

/** Slug of the channel currently being viewed, or undefined on the list view. */
export function useActiveChannelSlug(): string | undefined {
  const searchParams = useSearchParams()
  return searchParams.get(channelSearchParam) ?? undefined
}

/** Href for a channel's detail view. */
export function channelHref(slug: string) {
  return `/tv?${channelSearchParam}=${encodeURIComponent(slug)}`
}
