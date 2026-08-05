"use client"

import { useMemo, useState } from "react"
import { CheckIcon, SearchIcon, TvIcon } from "lucide-react"
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
import { proxyImageUrl } from "@/lib/image-proxy"
import { cn } from "@/lib/utils"
import { normalizeXmltvId } from "@/lib/xmltv-id"

// The directory runs to tens of thousands of entries. Scanning it per keystroke
// is cheap, but rendering more than a screenful is not, and a long list is not
// how anyone picks a match — they recognise the right one or refine the search.
const MATCH_RESULT_LIMIT = 5

export type EpgMatchChannel = {
  savedChannelId: number
  sourceId: number
  name: string
  xmltvId: string
}

type EpgDirectory = Record<
  string,
  { name: string; logoUrl?: string; countryCode?: string }
>

type EpgMatch = {
  xmltvId: string
  name: string
  logoUrl?: string
  countryCode?: string
}

function searchEpgChannels(
  directory: EpgDirectory,
  query: string,
): EpgMatch[] {
  const normalized = query.trim().toLowerCase()

  if (!normalized) {
    return []
  }

  const matches: EpgMatch[] = []

  for (const [xmltvId, entry] of Object.entries(directory)) {
    if (
      !xmltvId.toLowerCase().includes(normalized) &&
      !entry.name.toLowerCase().includes(normalized)
    ) {
      continue
    }

    matches.push({ xmltvId, ...entry })
  }

  // A name that starts with the query is almost always the one being looked
  // for; substring hits are the long tail behind it.
  matches.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(normalized) ? 0 : 1
    const bStarts = b.name.toLowerCase().startsWith(normalized) ? 0 : 1
    return aStarts - bStarts || a.name.length - b.name.length
  })

  return matches.slice(0, MATCH_RESULT_LIMIT)
}

export function ChannelEpgMatchDrawer({
  channel,
  epgChannels,
  isMobileLayout,
  useImageProxy,
  onOpenChange,
  onMatched,
}: {
  channel: EpgMatchChannel | null
  epgChannels: EpgDirectory
  isMobileLayout: boolean
  useImageProxy: boolean
  onOpenChange: (open: boolean) => void
  onMatched: (xmltvId: string) => void
}) {
  const [query, setQuery] = useState("")
  const [seededFor, setSeededFor] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Seed the search with the channel's own name: the match being looked for is
  // usually a near-spelling of it, so the first useful results are there before
  // anyone types. Adjusted during render rather than in an effect — React
  // re-renders immediately with the new value instead of painting the previous
  // channel's query first.
  if (channel && channel.savedChannelId !== seededFor) {
    setSeededFor(channel.savedChannelId)
    setQuery(channel.name)
  }

  const results = useMemo(
    () => searchEpgChannels(epgChannels, query),
    [epgChannels, query],
  )

  const currentXmltvId = channel ? normalizeXmltvId(channel.xmltvId) : ""
  const currentMatch = currentXmltvId ? epgChannels[currentXmltvId] : undefined

  async function assign(xmltvId: string) {
    if (!channel || isSaving) {
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(
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

      onMatched(normalizeXmltvId(xmltvId))
      toast.success(
        xmltvId ? "Guide match updated." : "Guide match cleared.",
      )
      onOpenChange(false)
    } catch {
      toast.error("Could not update the guide match.")
    } finally {
      setIsSaving(false)
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

          {currentMatch ? (
            <p className="text-muted-foreground text-xs">
              Currently matched to{" "}
              <span className="text-foreground font-mono">{currentXmltvId}</span>
            </p>
          ) : null}

          <ScrollArea className="min-h-40 flex-1" viewportTabIndex={-1}>
            <div className="flex flex-col gap-1 pr-3">
              {results.length ? (
                results.map((match) => {
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
                      onClick={() => void assign(match.xmltvId)}
                      className={cn(
                        "hover:bg-accent hover:text-accent-foreground h-auto w-full justify-start gap-3 rounded-md px-2 py-2 text-sm font-normal focus-visible:ring-inset",
                        selected && "bg-accent",
                      )}
                    >
                      <span className="border-border/60 flex size-9 shrink-0 items-center justify-center overflow-clip rounded-md border bg-zinc-900">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- Guide logos come from arbitrary hosts.
                          <img
                            src={logoUrl}
                            alt=""
                            className="size-full rounded-[4px] object-contain p-0.5"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <TvIcon className="text-muted-foreground size-4" />
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
                      {selected ? (
                        <CheckIcon className="text-primary size-4 shrink-0" />
                      ) : null}
                    </Button>
                  )
                })
              ) : (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  {query.trim()
                    ? `No guide listings match “${query.trim()}”.`
                    : "Search for a guide listing."}
                </p>
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
