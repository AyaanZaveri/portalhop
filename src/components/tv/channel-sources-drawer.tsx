"use client"

import { useRef } from "react"
import { GripVerticalIcon } from "lucide-react"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "@/components/reui/sortable"
import { getChannelKey } from "@portalhop/shared/channel-keys"
import type { PortalChannel } from "@portalhop/shared/stalker-types"
import { cn } from "@/lib/utils"

export type SourceChannel = PortalChannel & {
  portalSource?: { id: number; name: string }
}

/**
 * The streams behind one channel, in the order they will be tried.
 *
 * Every row shows the portal's own name for the channel rather than the tidied
 * one the list displays. That is the whole reason this list is worth reading:
 * the tidied name is identical on every row by construction, so showing it here
 * would be five copies of the same string. "SKY SPORTS F1 UHD" against
 * "4K| SKY SPORTS F1" is how someone tells which stream they are promoting.
 *
 * Two ways to choose, because they are two different intents. Dragging sets a
 * whole saved order; tapping plays one stream now. A tap must not alter what
 * opens next time — it is the escape hatch for a stream that is buffering.
 */
export function ChannelSourcesDrawer<T extends SourceChannel>({
  name,
  sources,
  canRemember,
  onSelect,
  onOrderChange,
  open,
  onOpenChange,
  isMobileLayout,
}: {
  /** The group's display name, for the header. */
  name: string
  /** The streams, already in the order they will be tried. */
  sources: T[]
  /**
   * Whether this channel can carry a saved choice. False for a channel with no
   * guide id, where there is no identity to hang one from — see identityKeyFor.
   */
  canRemember: boolean
  /** Play this source for the current view only. */
  onSelect: (source: T) => void
  /** The new order, most preferred first. */
  onOrderChange: (sources: T[]) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobileLayout: boolean
}) {
  // dnd-kit finishes a drag before the browser emits the trailing click. Keep
  // that click from turning a saved reorder into an unexpected navigation.
  const didDragRef = useRef(false)

  const choose = (channel: T) => {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    onSelect(channel)
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection={isMobileLayout ? "down" : "left"}
    >
      <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:85dvh] dark:border">
        <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="text-lg">Sources</DrawerTitle>
          <DrawerDescription>
            {sources.length === 1
              ? `One source carries ${name}.`
              : canRemember
                ? `${sources.length} sources carry ${name}. Tap one to play it now, or drag to set the default order.`
                : `${sources.length} sources carry ${name}. The top one plays first.`}
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4 pt-2">
            {/* Said once, up front, rather than after the drag that did
                nothing. A channel with no guide id has no identity to attach a
                choice to, so there is nothing here to remember it. */}
            {!canRemember && sources.length > 1 ? (
              <p className="text-muted-foreground mb-3 text-xs">
                This channel has no guide id, so a default source can&rsquo;t be
                saved for it. You can still tap a source to play it now.
              </p>
            ) : null}
            <Sortable
              value={sources}
              getItemValue={getChannelKey}
              onValueChange={onOrderChange}
              onDragStart={() => {
                didDragRef.current = true
              }}
            >
              <div className="flex flex-col gap-1">
                {sources.map((channel, index) => (
                  <SortableItem
                    key={getChannelKey(channel)}
                    value={getChannelKey(channel)}
                    className={cn(
                      "rounded-xl",
                      isMobileLayout ? "bg-background" : "bg-card",
                    )}
                  >
                    {/* The row is both the drag handle and the temporary play
                        target. Dragging is persisted; tapping never is. */}
                    <SortableItemHandle
                      onClick={() => choose(channel)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:cursor-grabbing",
                        "hover:bg-accent/60 cursor-pointer transition-colors",
                      )}
                    >
                      <span className="text-muted-foreground w-4 shrink-0 text-center font-mono text-xs tabular-nums">
                        {index + 1}
                      </span>

                      <span className="flex min-w-0 flex-1 flex-col">
                        {/* The portal's own name, untouched. */}
                        <span className="truncate text-sm font-medium">
                          {channel.sourceName ||
                            channel.name ||
                            "Unnamed channel"}
                        </span>
                        {/* The source as a badge, the way the player header
                            wears it. Same fact in the same treatment, so a row
                            here reads as the thing that will appear up there
                            once it plays. */}
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Badge variant="outline" className="h-5 shrink-0">
                            {channel.portalSource?.name ?? "Manual"}
                          </Badge>
                          {channel.number ? (
                            <span className="text-muted-foreground truncate font-mono text-[10px] tabular-nums">
                              #{channel.number}
                            </span>
                          ) : null}
                        </span>
                      </span>

                      {index === 0 ? (
                        <Badge variant="outline" className="shrink-0">
                          Default
                        </Badge>
                      ) : null}

                      <GripVerticalIcon className="text-muted-foreground size-4 shrink-0" />
                    </SortableItemHandle>
                  </SortableItem>
                ))}
              </div>
            </Sortable>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  )
}
