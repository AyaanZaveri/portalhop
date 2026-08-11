"use client"

import { useRef, useState } from "react"
import {
  ArrowUpDownIcon,
  CheckIcon,
  GripVerticalIcon,
  PencilIcon,
} from "lucide-react"

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "@/components/reui/sortable"
import { ChannelLogo } from "@/components/tv/channel-logo"
import { getChannelKey } from "@portalhop/shared/channel-keys"
import type { PortalChannel } from "@portalhop/shared/stalker-types"
import { cn } from "@/lib/utils"

export type SourceChannel = PortalChannel & {
  portalSource?: { id: number; name: string }
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
  const [mode, setMode] = useState<"browse" | "edit" | "reorder">("browse")
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
            {/* Each icon says what its own mode does: the pencil changes what
                a stream is, the arrows change which one plays first. Both live
                up here rather than on the rows, so the list at rest is a list
                of sources and nothing else. */}
            <div className="flex items-center gap-0.5">
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
                    <PencilIcon className="size-4 stroke-[2.25]" />
                  )}
                </Button>
              ) : null}
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
                    <SourceLabels source={source} />
                    <GripVerticalIcon className="text-muted-foreground size-4 shrink-0" />
                  </SortableItemHandle>
                </SortableItem>
              ))}
            </Sortable>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sources.map((source) => {
                const isActive = getChannelKey(source) === activeSourceKey
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
                      <SourceLabels source={source} />
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

function SourceLabels({ source }: { source: SourceChannel }) {
  const sourceName = source.portalSource?.name ?? "Manual"
  const streamName = source.sourceName || source.name || "Unnamed channel"

  // The channel first, the portal under it. The portal is how you tell two
  // rows apart, but it is not what either row is: reading "Max" over "TSN 1 4K"
  // makes the drawer a list of portals that happen to carry something, when it
  // is a list of the same channel arriving five ways.
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left leading-tight">
      <span className="truncate font-medium">{streamName}</span>
      <span className="text-muted-foreground truncate text-xs">
        {sourceName}
      </span>
    </span>
  )
}
