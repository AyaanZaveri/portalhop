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
import {
  ensureFeed,
  feedKeyFor,
  queryNowPlaying,
  searchNowPlaying,
  type NowPlaying,
} from "@/lib/epg"

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

/** Long enough that a word is typed before the guide is asked about it. */
const SEARCH_DEBOUNCE_MS = 220

/** One identity, so a caller memoising on this does not rerun every render. */
const NO_MATCHES: ReadonlySet<string> = new Set()

/**
 * Guide ids whose programme right now matches what is being typed.
 *
 * Deliberately not read from the context above. The list screen renders the
 * provider, so it cannot also consume it, and this is the one place that needs
 * the answer for every channel at once rather than for one row.
 *
 * Returns an empty set until the query settles and the read comes back, which
 * is what makes this safe to merge into a filter: name matches are already on
 * screen, and guide matches only ever add to them. Nothing a user can see
 * disappears when the promise lands.
 */
export function useNowPlayingSearch(query: string): ReadonlySet<string> {
  const [result, setResult] = useState<{
    term: string
    ids: Set<string>
  } | null>(null)

  const term = query.trim()

  useEffect(() => {
    if (term.length < 2) return

    let current = true
    const timer = setTimeout(() => {
      void searchNowPlaying(term, Date.now()).then((ids) => {
        // A slower read for an earlier query must not overwrite a later one.
        if (current) setResult({ term, ids })
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [term])

  // The stored term is checked rather than trusted, which is what makes the
  // effect above able to do nothing on a short query instead of clearing state
  // from inside its own body. It also fixes the case that version got wrong:
  // typing "news" and deleting back to "new" kept showing the results for
  // "news" until the next read landed. A result that does not belong to the
  // query on screen is not shown, so the stale ones go the moment the letter
  // does.
  return result && result.term === term ? result.ids : NO_MATCHES
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
    return (channel: PortalChannelWithSource) =>
      feedKeyFor(channel, epgBySource)
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
        .map((channel) =>
          channel.xmltvId ? normalizeXmltvId(channel.xmltvId) : "",
        )
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

      // Everything stored, not just the rows that were reported visible — the
      // viewport decides which guides to download, never which rows may show
      // one.
      const paint = async () => {
        const found = await queryNowPlaying(Date.now())
        if (!cancelled) setNowPlaying(found)
      }

      // Read before downloading anything. Waiting on the feeds first meant that
      // whenever one needed re-reading, every row sat blank for the length of a
      // 2.4MB download and bulk insert — including the rows whose programmes
      // were already sitting in the table. Whatever is stored is shown at once
      // and corrected behind.
      await paint()

      await Promise.all(
        [...feeds].map((key) =>
          // A guide that fails to load means no strip under the row, which is
          // the same as a channel that has no schedule — not worth an error.
          ensureFeed(key, wantedByFeed.get(key) ?? new Set())
            // Repainted per feed rather than once at the end, so a slow
            // country does not hold up the ones that have already landed.
            .then(paint)
            .catch(() => {}),
        ),
      )
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
