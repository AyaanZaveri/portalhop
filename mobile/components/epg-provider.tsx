import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import type { SavedSourceRecord } from "@portalhop/shared/source-types"

import type { PortalChannelWithSource } from "@/lib/channels"
import { ensureFeed, feedKeyFor, queryNowPlaying, type NowPlaying } from "@/lib/epg"

// Advances the progress bar and rolls a finished programme over to the next
// one. Slow on purpose: a bar spanning half an hour gains nothing from ticking
// faster, and this wakes the JS thread while the user is reading a list.
const TICK_MS = 30_000

// Only what is playing goes through context. Which rows are on screen is a
// prop: the list that knows it renders the provider, so it cannot also be one
// of its consumers.
const NowPlayingContext = createContext<Map<string, NowPlaying>>(new Map())

export function useNowPlaying(xmltvId: string | undefined) {
  const map = useContext(NowPlayingContext)
  return xmltvId ? map.get(normalizeXmltvId(xmltvId)) : undefined
}

export function EpgProvider({
  channels,
  portals,
  visible,
  children,
}: {
  channels: PortalChannelWithSource[]
  portals: SavedSourceRecord[] | undefined
  /** The rows currently on screen, from the list's viewport callback. */
  visible: PortalChannelWithSource[]
  children: ReactNode
}) {
  const [nowPlaying, setNowPlaying] = useState(
    () => new Map<string, NowPlaying>(),
  )
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  /**
   * Every channel the user has, grouped by the guide file it belongs to.
   *
   * Derived from the whole catalogue rather than what is on screen, even though
   * only visible channels trigger a download. A feed is written to SQLite once
   * and then marked as covering its window — if it were stored holding only the
   * fifteen rows that happened to be visible, the next fifteen would find the
   * feed already current and have no schedule at all.
   */
  const wantedByFeed = useMemo(() => {
    const epgBySource = new Map(
      (portals ?? []).map((portal) => [portal.id, portal]),
    )
    const grouped = new Map<string, Set<string>>()

    for (const channel of channels) {
      const key = feedKeyFor(channel, epgBySource)
      if (!key || !channel.xmltvId) continue
      const ids = grouped.get(key) ?? new Set<string>()
      ids.add(normalizeXmltvId(channel.xmltvId))
      grouped.set(key, ids)
    }

    if (__DEV__ && channels.length) {
      const custom = (portals ?? []).filter((p) => p.epgMode === "custom")
      console.log(
        `[portalhop] epg feeds: ` +
          [...grouped]
            .map(([key, ids]) => `${key}=${ids.size}`)
            .sort()
            .join(" ") +
          ` | custom sources: ${
            custom.map((p) => `${p.name}→${p.epgSourceId}`).join(", ") || "none"
          }`,
      )
    }

    return grouped
  }, [channels, portals])

  const feedOfChannel = useMemo(() => {
    const epgBySource = new Map(
      (portals ?? []).map((portal) => [portal.id, portal]),
    )
    return (channel: PortalChannelWithSource) => feedKeyFor(channel, epgBySource)
  }, [portals])

  // Held in a ref as well so the effect can read the current rows without
  // listing the array as a dependency — it is a fresh one on every scroll
  // settle, and the ids are what actually decide whether there is work to do.
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  // Keyed on the ids themselves, so scrolling through rows whose guide is
  // already loaded does not refetch, and scrolling back does no work at all.
  const visibleKey = useMemo(
    () =>
      visible
        .map((channel) => (channel.xmltvId ? normalizeXmltvId(channel.xmltvId) : ""))
        .filter(Boolean)
        .sort()
        .join(","),
    [visible],
  )

  useEffect(() => {
    if (!visibleKey) return

    let cancelled = false

    void (async () => {
      // Only the feeds the visible rows belong to. Downloading every country a
      // 33,000-channel catalogue touches would be tens of megabytes for
      // schedules the user has not scrolled to.
      const feeds = new Set<string>()
      for (const channel of visibleRef.current) {
        const key = feedOfChannel(channel)
        if (key) feeds.add(key)
      }

      await Promise.all(
        [...feeds].map((key) =>
          // A guide that fails to load means no strip under the row, which is
          // the same as a channel that has no schedule — not worth an error.
          ensureFeed(key, wantedByFeed.get(key) ?? new Set()).catch(() => {}),
        ),
      )

      if (cancelled) return

      // Everything stored, not just the rows that were reported visible — the
      // viewport decides which guides to download, never which rows may show
      // one.
      const found = await queryNowPlaying(Date.now())
      if (!cancelled) setNowPlaying(found)
    })()

    return () => {
      cancelled = true
    }
  }, [visibleKey, tick, feedOfChannel, wantedByFeed])

  return (
    <NowPlayingContext.Provider value={nowPlaying}>
      {children}
    </NowPlayingContext.Provider>
  )
}
