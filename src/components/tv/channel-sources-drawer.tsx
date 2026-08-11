"use client"

import { useRef, useState } from "react"
import { CheckIcon, GripVerticalIcon, PencilIcon } from "lucide-react"

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
 * and Groups: plain buttons for everyday choices, with ordering disclosed only
 * after pressing Edit. A source is a choice, not a settings surface.
 */
export function ChannelSourcesDrawer<T extends SourceChannel>({
  sources,
  activeSourceKey,
  canRemember,
  onSelect,
  onOrderChange,
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
  getLogoUrl: (source: T) => string
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobileLayout: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const didDragRef = useRef(false)

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) setIsEditing(false)
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
            {canRemember && sources.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  isEditing ? "Finish editing sources" : "Edit sources"
                }
                onClick={() => setIsEditing((current) => !current)}
              >
                {isEditing ? (
                  <CheckIcon className="size-4 stroke-[2.25]" />
                ) : (
                  <PencilIcon className="size-4 stroke-[2.25]" />
                )}
              </Button>
            ) : null}
          </div>
        </DrawerHeader>
        <ScrollArea
          className="min-h-0 flex-1"
          viewportTabIndex={-1}
          viewportClassName="px-4 pt-3 pb-4"
        >
          {isEditing ? (
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
                  <Button
                    key={getChannelKey(source)}
                    type="button"
                    variant="ghost"
                    onClick={() => selectSource(source)}
                    className="hover:bg-accent hover:text-accent-foreground h-auto w-full justify-start gap-3 rounded-lg px-2 py-2.5 text-sm font-normal"
                  >
                    <ChannelLogo url={getLogoUrl(source)} />
                    <SourceLabels source={source} />
                    {/* A dot rather than a filled row. Every row here carries a
                        logo tile of the channel's own colour, so a tinted
                        background lands behind artwork that is already loud and
                        the list reads as two competing fills. One mark on the
                        right says the same thing and leaves the row alone. */}
                    <span
                      aria-hidden
                      className={cn(
                        "bg-primary size-2 shrink-0 rounded-full transition-opacity",
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {isActive ? <span className="sr-only">Playing</span> : null}
                  </Button>
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
