"use client"

import { useEffect, useRef, useState } from "react"
import {
  ArrowUpDownIcon,
  CalendarClockIcon,
  CheckIcon,
  GripVerticalIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  PencilIcon,
  ScanSearchIcon,
  StarIcon,
} from "lucide-react"

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "@/components/reui/sortable"
import { Badge } from "@/components/ui/badge"
import { ChannelLogo } from "@/components/tv/channel-logo"
import { ShimmeringText } from "@/components/ui/shimmering-text"
import { getChannelKey } from "@portalhop/shared/channel-keys"
import type { PortalChannel } from "@portalhop/shared/stalker-types"
import type { EpgMode } from "@portalhop/shared/source-types"
import { cn } from "@/lib/utils"
import { useTv } from "@/components/tv/tv-provider"
import { streamLabels, type StreamInfo } from "@portalhop/shared/stream-info"
import { canSupplyEpg } from "@portalhop/shared/epg-preference"
import { apiFetch } from "@/lib/api-fetch"

function IptvEpgMark() {
  return <>
    {/* eslint-disable-next-line @next/next/no-img-element -- Local brand mark, rendered at icon size. */}
    <img src="/epg/iptv-epg-light.png" alt="" className="size-4 rounded-xs object-contain dark:hidden" />
    {/* eslint-disable-next-line @next/next/no-img-element -- Local brand mark, rendered at icon size. */}
    <img src="/epg/iptv-epg-dark.png" alt="" className="hidden size-4 rounded-xs object-contain dark:block" />
  </>
}

export type SourceChannel = PortalChannel & {
  // epgMode and epgSourceId are here because the drawer is where a channel's
  // guide is chosen, and whether a row can supply one at all depends on them.
  portalSource?: {
    id: number
    name: string
    epgMode: EpgMode
    epgSourceId: number | null
  }
}

/**
 * The source switcher deliberately uses the same drawer grammar as Categories
 * and Groups: plain buttons for everyday choices, with everything that edits
 * rather than chooses disclosed behind a control in the header. A source is a
 * choice, not a settings surface.
 */
export function ChannelSourcesDrawer<T extends SourceChannel>({
  sources,
  activeSourceKey,
  canRemember,
  onSelect,
  onOrderChange,
  onEditGuideMatch,
  guideSourceKey,
  onUseGuide,
  onResetGuide,
  onProbeAll,
  getLogoUrl,
  open,
  onOpenChange,
  isMobileLayout,
}: {
  sources: T[]
  activeSourceKey: string
  canRemember: boolean
  onSelect: (source: T) => void
  onOrderChange: (sources: T[]) => void
  /**
   * Opens the guide match for one stream, or absent where nothing here has a
   * saved row to pin an id to.
   *
   * Per source rather than per channel, because that is what a guide id is: a
   * portal writes one on each of its own rows, and it is the row that is wrong
   * when the match is wrong. Five streams of one channel can disagree about
   * which guide entry they are, and fixing one is not fixing the others.
   */
  onEditGuideMatch?: (source: T) => void
  /**
   * The stream currently supplying this channel's guide, and whether that was
   * chosen or worked out.
   *
   * One per channel, unlike the guide *match* above it: a match says which
   * entry in a guide this stream is, which is a fact about the stream. This
   * says which of the streams' guides the channel reads, which is a fact about
   * the channel. The drawer is the only place both are visible at once, which
   * is why the distinction has to be legible here.
   */
  guideSourceKey?: string
  /** Pins the channel's guide to one stream. */
  onUseGuide?: (source: T) => void
  /** Drops the channel back to the ranking. */
  onResetGuide?: () => void
  /** Probes all source streams, reporting completion one row at a time. */
  onProbeAll?: (
    sources: T[],
    onProbeState: (source: T, state: "start" | "complete") => void,
  ) => Promise<void>
  getLogoUrl: (source: T) => string
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobileLayout: boolean
}) {
  /**
   * Three states, because there are three things to do to this list and only
   * one of them is what anyone came here for.
   *
   * "browse" is the drawer at rest: tap a source, it plays. "edit" reveals the
   * per-source pencils that correct a stream's guide match. "reorder" turns the
   * rows into a draggable list. The two edits are separate modes rather than
   * one, because they act on different things — a pencil changes what a stream
   * *is*, dragging changes which one plays first — and a row wearing both a
   * grip and a pencil is two small targets on top of the one that matters,
   * which is the row itself.
   */
  // What each of these streams turned out to be, where one has been watched.
  // This is the drawer the readings were collected for.
  const { streamInfo } = useTv()
  const [mode, setMode] = useState<"browse" | "edit" | "reorder">("browse")
  const [probeProgress, setProbeProgress] = useState<number | null>(null)
  const [probingSourceKeys, setProbingSourceKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [customGuideNames, setCustomGuideNames] = useState<Record<number, string>>({})
  useEffect(() => {
    if (!open) return
    let active = true
    void apiFetch("/api/epg-sources")
      .then((response) => response.ok ? response.json() : null)
      .then((body: { sources?: Array<{ id: number; name: string }> } | null) => {
        if (active && body?.sources) {
          setCustomGuideNames(Object.fromEntries(body.sources.map((source) => [source.id, source.name])))
        }
      })
      .catch(() => {})
    return () => { active = false }
  }, [open])
  const guideSource = guideSourceKey
    ? sources.find((source) => getChannelKey(source) === guideSourceKey)
    : undefined
  // Guide selection is intentionally provider-shaped, not stream-shaped. A
  // custom XMLTV provider can be attached to several portals; presenting all
  // of those copies made the choice look like playback selection again.
  const guideProviders = sources.reduce<T[]>((items, source) => {
    if (!source.xmltvId || !canSupplyEpg(source)) return items
    const mode = source.portalSource?.epgMode
    if (mode === "portal") return items
    const key = mode === "custom"
      ? `custom:${source.portalSource?.epgSourceId ?? 0}`
      : "iptv-org"
    const alreadyAdded = items.some((item) => {
      const itemMode = item.portalSource?.epgMode
      return itemMode === "custom"
        ? key === `custom:${item.portalSource?.epgSourceId ?? 0}`
        : itemMode === "iptv-org" && key === "iptv-org"
    })
    if (!alreadyAdded) items.push(source)
    return items
  }, [])
  const guideLabel = (source: T) => source.portalSource?.epgMode === "iptv-org"
    ? "IPTV-EPG"
    : source.portalSource?.epgMode === "custom"
      ? customGuideNames[source.portalSource?.epgSourceId ?? 0] ?? "Custom XMLTV"
      : source.portalSource?.name ?? "Portal guide"
  const didDragRef = useRef(false)

  const toggle = (next: "edit" | "reorder") =>
    setMode((current) => (current === next ? "browse" : next))

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) setMode("browse")
  }

  const selectSource = (source: T) => {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    onSelect(source)
  }

  const probeAll = async () => {
    if (!onProbeAll || probeProgress !== null) return
    setProbeProgress(0)
    setProbingSourceKeys(new Set())
    try {
      await onProbeAll(sources, (source, state) => {
        const key = getChannelKey(source)
        setProbingSourceKeys((current) => {
          const next = new Set(current)
          if (state === "start") next.add(key)
          else next.delete(key)
          return next
        })
        if (state === "complete") {
          setProbeProgress((current) => (current ?? 0) + 1)
        }
      })
    } finally {
      setProbeProgress(null)
      setProbingSourceKeys(new Set())
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={close}
      swipeDirection={isMobileLayout ? "down" : "left"}
      showSwipeHandle={isMobileLayout}
    >
      <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:75dvh] dark:border">
        <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
          <div className="flex items-center justify-between gap-3">
            <DrawerTitle className="text-lg">Sources</DrawerTitle>
            {/* Source management stays together: ordering first, then guide
                matching. Probing is an independent read-only action, so the
                divider keeps it from reading as a third editing mode. */}
            <div className="flex items-center gap-0.5">
              {canRemember && sources.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={
                    mode === "reorder"
                      ? "Finish reordering sources"
                      : "Reorder sources"
                  }
                  aria-pressed={mode === "reorder"}
                  onClick={() => toggle("reorder")}
                >
                  {mode === "reorder" ? (
                    <CheckIcon className="size-4 stroke-[2.25]" />
                  ) : (
                    <ArrowUpDownIcon className="size-4 stroke-[2.25]" />
                  )}
                </Button>
              ) : null}
              {onEditGuideMatch ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={
                    mode === "edit"
                      ? "Finish editing guide matches"
                      : "Edit guide matches"
                  }
                  aria-pressed={mode === "edit"}
                  onClick={() => toggle("edit")}
                >
                  {mode === "edit" ? (
                    <CheckIcon className="size-4 stroke-[2.25]" />
                  ) : (
                    <ListChecksIcon className="size-4 stroke-[2.25]" />
                  )}
                </Button>
              ) : null}
              {onProbeAll &&
              sources.length > 0 &&
              (onEditGuideMatch || (canRemember && sources.length > 1)) ? (
                <span
                  aria-hidden
                  className="bg-border mx-1 h-4 w-px shrink-0"
                />
              ) : null}
              {onProbeAll && sources.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={probeProgress !== null}
                  aria-label={
                    probeProgress === null
                      ? "Probe all stream sources"
                      : `Probing source ${probeProgress + 1} of ${sources.length}`
                  }
                  onClick={() => void probeAll()}
                >
                  {probeProgress === null ? (
                    <ScanSearchIcon className="size-4 stroke-[2.25]" />
                  ) : (
                    <LoaderCircleIcon className="size-4 animate-spin stroke-[2.25]" />
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </DrawerHeader>
        <ScrollArea
          className="min-h-0 flex-1"
          viewportTabIndex={-1}
          viewportClassName="px-4 pt-3 pb-4"
        >
          {mode === "reorder" ? (
            // The items are Sortable's own children, with the column laid out
            // on Sortable itself. A wrapping <div> here is what pinned the drag
            // to the list: Sortable finds the row to float under the cursor by
            // scanning its direct children for the one being dragged, so a
            // wrapper hides every row from it, no overlay is rendered, and all
            // that moves is the row still in the list -- which can only slide
            // along the column and snap between slots. Same arrangement the
            // favourites reorder uses, and the reason that one feels free.
            <Sortable
              value={sources}
              getItemValue={getChannelKey}
              onValueChange={onOrderChange}
              onDragStart={() => {
                didDragRef.current = true
              }}
              className="flex flex-col gap-1.5"
            >
              {sources.map((source) => (
                <SortableItem
                  key={getChannelKey(source)}
                  value={getChannelKey(source)}
                  // A surface of its own, because the row being dragged is
                  // copied out to document.body and floats over the page.
                  // Without one it would render transparent the moment it
                  // left the panel — the same reason the favourites reorder
                  // rows carry a background.
                  className="bg-popover rounded-lg"
                >
                  {/* The same box as the plain row below, so pressing Edit
                      changes what a row does and not how tall it is. */}
                  <SortableItemHandle className="hover:bg-accent flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors">
                    <ChannelLogo url={getLogoUrl(source)} />
                    <SourceLabels
                      source={source}
                      probing={probingSourceKeys.has(getChannelKey(source))}
                      info={
                        source.savedChannelId == null
                          ? undefined
                          : streamInfo[source.savedChannelId]
                      }
                    />
                    <GripVerticalIcon className="text-muted-foreground size-4 shrink-0" />
                  </SortableItemHandle>
                </SortableItem>
              ))}
            </Sortable>
          ) : (
            <div className="flex flex-col gap-1.5">
              {mode === "edit" && onUseGuide ? (
                <div className="mb-2 flex flex-col gap-1.5">
                  <p className="text-muted-foreground px-2 text-xs font-medium">Guide</p>
                  <Select value={guideSource ? getChannelKey(guideSource) : "__priority__"} onValueChange={(value) => { if (value === "__priority__") { onResetGuide?.(); return } const source = guideProviders.find((item) => getChannelKey(item) === value); if (source) onUseGuide(source) }}>
                    <SelectTrigger className="w-full"><SelectValue>{guideSource ? () => <span className="flex items-center gap-2">{guideSource.portalSource?.epgMode === "iptv-org" ? <><IptvEpgMark />IPTV-EPG</> : <><CalendarClockIcon className="size-4" />{guideLabel(guideSource)}</>}</span> : <span className="flex items-center gap-2"><StarIcon className="size-4 fill-current" />Use guide priority</span>}</SelectValue></SelectTrigger>
                    <SelectContent side="bottom" align="start" alignItemWithTrigger={false}>
                      <SelectGroup><SelectLabel>Guide providers</SelectLabel><SelectItem value="__priority__"><StarIcon className="fill-current" />Use guide priority</SelectItem>{guideProviders.map((source) => <SelectItem key={`provider:${getChannelKey(source)}`} value={getChannelKey(source)}>{source.portalSource?.epgMode === "iptv-org" ? <><IptvEpgMark />IPTV-EPG</> : <><CalendarClockIcon />{guideLabel(source)}</>}</SelectItem>)}</SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {sources.map((source) => {
                const isActive = getChannelKey(source) === activeSourceKey
                const isProbing = probingSourceKeys.has(getChannelKey(source))
                return (
                  <div
                    key={getChannelKey(source)}
                    className="flex items-center gap-0.5"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => selectSource(source)}
                      className="hover:bg-accent hover:text-accent-foreground h-auto min-w-0 flex-1 justify-start gap-3 rounded-lg px-2 py-2.5 text-sm font-normal"
                    >
                      <ChannelLogo url={getLogoUrl(source)} />
                      <SourceLabels
                        source={source}
                        probing={isProbing}
                        info={
                          source.savedChannelId == null
                            ? undefined
                            : streamInfo[source.savedChannelId]
                        }
                      />
                      {/* A dot rather than a filled row. Every row here carries
                          a logo tile of the channel's own colour, so a tinted
                          background lands behind artwork that is already loud
                          and the list reads as two competing fills. One mark on
                          the right says the same thing and leaves the row
                          alone. */}
                      <span
                        aria-hidden
                        className={cn(
                          "bg-primary size-2 shrink-0 rounded-full transition-opacity",
                          isActive ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {isActive ? (
                        <span className="sr-only">Playing</span>
                      ) : null}
                    </Button>
                    {/* Only once the pencil above has been pressed, and beside
                        the row rather than inside it: a button cannot contain a
                        button, and the row's job is to play this stream. */}
                    {/* Two edits, and they are not the same one. The pencil
                        changes which guide entry this stream is; the calendar
                        makes this stream's guide the channel's. Only rows that
                        could actually answer get the calendar, and the one
                        already answering gets it filled rather than hidden, so
                        the list says which is which without a legend. */}
                    {mode === "edit" && onEditGuideMatch ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        aria-label={`Change guide match for ${source.sourceName || source.name || "this source"}`}
                        onClick={() => onEditGuideMatch(source)}
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  )
}

function SourceLabels({
  source,
  info,
  probing = false,
}: {
  source: SourceChannel
  info?: StreamInfo
  probing?: boolean
}) {
  const sourceName = source.portalSource?.name ?? "Manual"
  const streamName = source.sourceName || source.name || "Unnamed channel"
  const labels = streamLabels(info)

  // The channel first, the portal under it. The portal is how you tell two
  // rows apart, but it is not what either row is: reading "Max" over "TSN 1 4K"
  // makes the drawer a list of portals that happen to carry something, when it
  // is a list of the same channel arriving five ways.
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left leading-tight">
      {probing ? (
        <ShimmeringText
          text={streamName}
          duration={1.25}
          className="max-w-full truncate font-medium"
        />
      ) : (
        <span className="truncate font-medium">{streamName}</span>
      )}
      {/* The portal and the figures as one set of badges: they are the same
          kind of thing, a short fact about this stream, and the portal is the
          one every row has. The figures follow, and only for streams somebody
          has played — a row without them is not claiming to be worse, it is one
          nobody has opened yet. */}
      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
        <Badge variant="secondary" className="h-5 rounded px-1.5 text-[10px]">
          <span className="truncate">{sourceName}</span>
        </Badge>
        {labels.map((label) => (
          <Badge
            key={label}
            variant="secondary"
            className="h-5 shrink-0 rounded px-1.5 text-[10px] tabular-nums"
          >
            {label}
          </Badge>
        ))}
      </span>
    </span>
  )
}
