"use client"

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
 */
export function ChannelSourcesDrawer({
  name,
  sources,
  order,
  onOrderChange,
  open,
  onOpenChange,
  isMobileLayout,
}: {
  /** The group's display name, for the header. */
  name: string
  sources: SourceChannel[]
  /** Channel keys, most preferred first. */
  order: string[]
  onOrderChange: (order: string[]) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobileLayout: boolean
}) {
  const byKey = new Map(sources.map((channel) => [getChannelKey(channel), channel]))
  const ordered = order
    .map((key) => byKey.get(key))
    .filter((channel): channel is SourceChannel => Boolean(channel))

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection={isMobileLayout ? "down" : "left"}
    >
      <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md dark:border [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:85dvh]">
        <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="text-lg">Sources</DrawerTitle>
          <DrawerDescription>
            {sources.length === 1
              ? `One source carries ${name}.`
              : `${sources.length} sources carry ${name}. The top one plays first.`}
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4 pt-2">
            <Sortable
              value={ordered}
              getItemValue={getChannelKey}
              onValueChange={(next) => onOrderChange(next.map(getChannelKey))}
            >
              <div className="flex flex-col gap-1">
                {ordered.map((channel, index) => (
                  <SortableItem
                    key={getChannelKey(channel)}
                    value={getChannelKey(channel)}
                    className={cn(
                      "rounded-xl",
                      isMobileLayout ? "bg-background" : "bg-card",
                    )}
                  >
                    {/* The handle is the row, the same trade the reorder list
                        makes: there is nothing else to do to a row here, so
                        making only a grip draggable would be a smaller target
                        for no gain. */}
                    <SortableItemHandle className="flex w-full cursor-grab items-center gap-3 rounded-xl px-3 py-2.5 text-left active:cursor-grabbing">
                      <span className="text-muted-foreground w-4 shrink-0 text-center font-mono text-xs tabular-nums">
                        {index + 1}
                      </span>

                      <span className="flex min-w-0 flex-1 flex-col">
                        {/* The portal's own name, untouched. */}
                        <span className="truncate text-sm font-medium">
                          {channel.name || "Unnamed channel"}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          {channel.portalSource?.name ?? "Manual source"}
                          {channel.number ? ` · #${channel.number}` : ""}
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
