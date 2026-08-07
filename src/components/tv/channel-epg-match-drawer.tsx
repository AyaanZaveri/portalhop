"use client"

import { useEffect, useState } from "react"
import { CheckIcon, SearchIcon, TvIcon } from "lucide-react"
import { ShimmeringText } from "@/components/ui/shimmering-text"
import { Spinner } from "@/components/ui/spinner"
import { ThinkingOrb } from "thinking-orbs"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { proxyImageUrl } from "@portalhop/shared/image-proxy"
import { cn } from "@/lib/utils"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import { apiFetch } from "@/lib/api-fetch"

// Five results: a longer list is not how anyone recognises a channel, they
// either see it or refine the search.
const MATCH_RESULT_LIMIT = 5

// Long enough that typing a channel name is one request rather than one per
// letter, short enough that the list feels like it is keeping up.
const SEARCH_DEBOUNCE_MS = 250

export type EpgMatchChannel = {
  savedChannelId: number
  sourceId: number
  name: string
  xmltvId: string
}

type EpgMatch = {
  xmltvId: string
  name: string
  logoUrl?: string
  countryCode?: string
}

export function ChannelEpgMatchDrawer({
  channel,
  isMobileLayout,
  useImageProxy,
  onOpenChange,
  onMatched,
}: {
  channel: EpgMatchChannel | null
  isMobileLayout: boolean
  useImageProxy: boolean
  onOpenChange: (open: boolean) => void
  onMatched: (xmltvId: string, logoUrl?: string) => void
}) {
  const [query, setQuery] = useState("")
  const [seededFor, setSeededFor] = useState<number | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const isSaving = savingId !== null
  // Results are stored with the query they answer, so "still searching" and
  // "nothing to show yet" are derived rather than tracked in their own state —
  // which also keeps every setState out of the effect body.
  const [results, setResults] = useState<{ query: string; items: EpgMatch[] }>({
    query: "",
    items: [],
  })

  // Seed the search with the channel's own name: the match being looked for is
  // usually a near-spelling of it, so the first useful results are there before
  // anyone types. Adjusted during render rather than in an effect — React
  // re-renders immediately with the new value instead of painting the previous
  // channel's query first.
  if (channel && channel.savedChannelId !== seededFor) {
    setSeededFor(channel.savedChannelId)
    setQuery(channel.name)
  }

  const trimmedQuery = query.trim()
  const isSearching = Boolean(channel) && trimmedQuery !== "" && results.query !== trimmedQuery
  const visibleResults = results.query === trimmedQuery ? results.items : []

  // The directory is ~28,000 listings and 5.8MB, so it stays on the server and
  // only the handful being shown crosses the wire.
  useEffect(() => {
    if (!channel || !trimmedQuery) {
      return
    }

    let cancelled = false

    const timer = setTimeout(() => {
      apiFetch(
        `/api/epg/channels?limit=${MATCH_RESULT_LIMIT}&q=${encodeURIComponent(trimmedQuery)}`,
      )
        .then((response) => (response.ok ? response.json() : { results: [] }))
        .then((data: { results?: EpgMatch[] }) => {
          if (!cancelled) {
            setResults({ query: trimmedQuery, items: data.results ?? [] })
          }
        })
        .catch(() => {
          if (!cancelled) setResults({ query: trimmedQuery, items: [] })
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [channel, trimmedQuery])

  const currentXmltvId = channel ? normalizeXmltvId(channel.xmltvId) : ""

  async function assign(xmltvId: string, label?: string, logoUrl?: string) {
    if (!channel || isSaving) {
      return
    }

    setSavingId(xmltvId || "__clear__")

    try {
      const response = await apiFetch(
        `/api/portals/${channel.sourceId}/channels/${channel.savedChannelId}/xmltv`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ xmltvId }),
        },
      )

      if (!response.ok) {
        throw new Error()
      }

      onMatched(normalizeXmltvId(xmltvId), logoUrl)
      // Names what was saved rather than just that something was: the whole
      // point of the drawer is picking a specific listing.
      toast.success(
        xmltvId
          ? `Matched to ${label ?? normalizeXmltvId(xmltvId)}`
          : "Guide match cleared.",
      )
      onOpenChange(false)
    } catch {
      toast.error("Could not update the guide match.")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Drawer
      open={Boolean(channel)}
      onOpenChange={onOpenChange}
      swipeDirection={isMobileLayout ? "down" : "left"}
    >
      <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md dark:border [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:85dvh]">
        <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="text-lg">Guide match</DrawerTitle>
          <DrawerDescription>
            {channel
              ? `Choose the guide listing for ${channel.name || "this channel"}.`
              : "Choose the guide listing for this channel."}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 pt-2">
          <InputGroup>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the guide"
              aria-label="Search guide listings"
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>

          {currentXmltvId ? (
            <p className="text-muted-foreground text-xs">
              Currently matched to{" "}
              <span className="text-foreground font-mono">{currentXmltvId}</span>
            </p>
          ) : null}

          <ScrollArea className="min-h-40 flex-1" viewportTabIndex={-1}>
            <div className="flex flex-col gap-1">
              {visibleResults.length ? (
                visibleResults.map((match) => {
                  const logoUrl = match.logoUrl
                    ? proxyImageUrl(match.logoUrl, useImageProxy)
                    : ""
                  const selected = match.xmltvId === currentXmltvId

                  return (
                    <Button
                      key={match.xmltvId}
                      type="button"
                      variant="ghost"
                      disabled={isSaving}
                      onClick={() => void assign(match.xmltvId, match.name, match.logoUrl)}
                      className={cn(
                        "hover:bg-accent hover:text-accent-foreground h-auto w-full justify-start gap-3 rounded-md py-2 pr-2 pl-2 text-sm font-normal focus-visible:ring-inset",
                        selected && "bg-accent",
                      )}
                    >
                      {/* Same treatment as a channel row: the padding belongs
                          on the tile, not the image — on the image it sits
                          inside a box that still fills the tile, so the logo
                          runs into the corners. */}
                      <span className="border-border/60 flex size-11 shrink-0 items-center justify-center overflow-clip rounded-lg border bg-zinc-900 p-1">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- Guide logos come from arbitrary hosts.
                          <img
                            src={logoUrl}
                            alt=""
                            className="size-full rounded-[6px] object-contain"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <TvIcon className="text-muted-foreground" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col text-left">
                        <span className="truncate font-medium">
                          {match.name}
                        </span>
                        <span className="text-muted-foreground truncate font-mono text-xs">
                          {match.xmltvId}
                        </span>
                      </span>
                      {savingId === match.xmltvId ? (
                        <Spinner className="text-muted-foreground shrink-0" />
                      ) : selected ? (
                        <CheckIcon className="text-primary size-4 shrink-0" />
                      ) : null}
                    </Button>
                  )
                })
              ) : (
                <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
                  {isSearching ? (
                    // size 20 is the package's inline-text preset — the sizes
                    // are separate tuned designs, not a scale factor, so 64
                    // would not simply be a bigger version of this.
                    <span className="flex items-center gap-2">
                      <ThinkingOrb state="searching" size={20} />
                      <ShimmeringText text="Searching the guide" />
                    </span>
                  ) : trimmedQuery ? (
                    <p>No listings match “{trimmedQuery}”</p>
                  ) : (
                    <p>Type to search the guide</p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {currentXmltvId ? (
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => void assign("")}
              className="mt-auto"
            >
              Clear match
            </Button>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
