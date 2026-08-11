"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/api-fetch"
import { useHaptics } from "@/hooks/use-haptics"
import { channelHref, useActiveChannelSlug } from "@/hooks/use-active-channel"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  FolderHeartIcon,
  FolderPlusIcon,
  LayoutGridIcon,
  ListFilterIcon,
  MoreVerticalIcon,
  PencilIcon,
  ArrowUpDownIcon,
  GripVerticalIcon,
  SearchIcon,
  ShapesIcon,
  StarIcon,
  TvIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChannelRowSkeletons } from "@/components/tv/tv-placeholders"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "@/components/reui/sortable"
import {
  groupChannels,
  orderByChosenSource,
} from "@portalhop/shared/channel-grouping"
import { isFavoriteKeyed } from "@portalhop/shared/channel-keys"
import { ChannelLogo } from "@/components/tv/channel-logo"
import { CategoryVisual } from "@/components/category-visual"
import { PortalHopWordmark } from "@/components/portal-hop-wordmark"
import {
  FavoriteGroupsDrawer,
  getCachedFavoriteGroups,
  getFavoriteGroupIcon,
  GroupMembershipDrawer,
  reorderFavoriteGroupChannelsLocal,
  loadFavoriteGroups,
  subscribeToFavoriteGroups,
  type FavoriteGroup,
} from "@/components/tv/favorite-groups-drawer"
import { chipButtonProps, chipLabelCollapse } from "@/components/tv/chip-button"
import { toast } from "sonner"

import { reorderFavoritesLocal } from "@/lib/favorites"
import { cn } from "@/lib/utils"
import { TV_MOBILE_LAYOUT_QUERY, useMediaQuery } from "@/hooks/use-media-query"
import {
  canResolveChannel,
  formatClockTime,
  getChannelKey,
  type PortalChannelWithSource,
  type PortalSource,
} from "@/lib/tv-channels"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import { useEpgNow } from "@/hooks/use-epg-now"
import { useTv } from "@/components/tv/tv-provider"

type CategoryEntry = {
  sourceId: number
  sourceName: string
  genre: string
  count: number
}

function categoryPreferenceKey(sourceId: number, genre: string) {
  return `${sourceId}\u0000${genre}`
}

/**
 * Orders channels by a saved sequence of channel keys. Anything not in the
 * sequence keeps its catalogue position at the end, so a channel added since
 * the last reorder appears rather than disappearing.
 */
function sortByKeyOrder(
  channels: PortalChannelWithSource[],
  orderedKeys: string[],
) {
  if (!orderedKeys.length) {
    return channels
  }

  const rank = new Map(orderedKeys.map((key, index) => [key, index]))

  return [...channels].sort((a, b) => {
    const aRank = rank.get(getChannelKey(a)) ?? Number.MAX_SAFE_INTEGER
    const bRank = rank.get(getChannelKey(b)) ?? Number.MAX_SAFE_INTEGER
    return aRank - bRank
  })
}

// The category list tints its icons with the primary colour and knocks the
// brightness back so they read as accents rather than competing with the label.
// Light mode needs the heavier reduction; dark mode is already dim enough.
//
// The colour is forced because the dropdown item repaints every descendant on
// hover (focus:**:text-accent-foreground), to keep muted text legible against
// the accent fill. That's right for text and wrong for an accent icon: hovering
// only shifts the background by 3% lightness, so there is nothing to stay
// legible against, and the icon would otherwise be the one row out of the list
// rendered in a different colour.
const portalIconClassName = "!text-primary brightness-75 dark:brightness-90"

export function ChannelList({
  headerControls,
}: {
  headerControls?: ReactNode
}) {
  const {
    browserChannels: allChannels,
    filteredChannels: channels,
    query,
    setQuery,
    browseFilter,
    chooseFilter,
    selectedPortalIds,
    setSelectedPortalIds,
    togglePortal,
    categoryMenuOpen,
    setCategoryMenuOpen,
    categorySearch,
    setCategorySearch,
    favorites,
    isChannelFavorited,
    favoriteKeyFor,
    toggleFavorite,
    channelSlug,
    hiddenCategories,
    setCategoryHidden,
    channelLogoUrl,
    identityKeyOf,
    trustedIds,
    userId,
    sourceOrder,
  } = useTv()

  const router = useRouter()
  const activeSlug = useActiveChannelSlug()
  const isMobileLayout = useMediaQuery(TV_MOBILE_LAYOUT_QUERY, true)
  const triggerHaptic = useHaptics()

  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const categoryTriggerRef = useRef<HTMLButtonElement>(null)
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressChannelClickRef = useRef(false)
  const categoryLongPressTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const suppressCategoryClickRef = useRef(false)
  // The row the drag was last over, so a haptic fires once per row crossed
  // rather than on every pointer move that stays within the same one.
  const lastDragOverIdRef = useRef<string | null>(null)
  const [contextChannel, setContextChannel] =
    useState<PortalChannelWithSource | null>(null)
  const [groupMembershipChannel, setGroupMembershipChannel] =
    useState<PortalChannelWithSource | null>(null)
  const [contextCategory, setContextCategory] = useState<CategoryEntry | null>(
    null,
  )
  const [isManagingCategories, setIsManagingCategories] = useState(false)
  // Local rather than in the TV context: nothing outside this list opens the
  // portal filter, unlike the category menu the header can also trigger.
  const [portalFilterOpen, setPortalFilterOpen] = useState(false)
  const [isReordering, setIsReordering] = useState(false)
  // Holds the order during and just after a drag. The saved order only comes
  // back once favourites or the group reloads, so without this the list would
  // snap back under the cursor.
  const [reorderedChannels, setReorderedChannels] = useState<
    PortalChannelWithSource[] | null
  >(null)
  const [selectedFavoriteGroupKeys, setSelectedFavoriteGroupKeys] = useState<
    Set<string>
  >(() => new Set())
  const [selectedFavoriteGroup, setSelectedFavoriteGroup] =
    useState<FavoriteGroup | null>(null)
  const [isRestoringFavoriteGroup, setIsRestoringFavoriteGroup] = useState(
    () => browseFilter.type === "favoriteGroup",
  )
  const [groupedChannelKeys, setGroupedChannelKeys] = useState<Set<string>>(
    () => new Set(),
  )

  // The provider preserves the selected group id while opening a channel, but
  // this list remounts on the detail route. Rehydrate the group membership so
  // Back returns to the same collection instead of an empty key set.
  useEffect(() => {
    if (browseFilter.type !== "favoriteGroup") return
    if (selectedFavoriteGroup?.id === browseFilter.groupId) return

    let cancelled = false
    loadFavoriteGroups()
      .then((groups) => {
        const group = groups.find((entry) => entry.id === browseFilter.groupId)
        if (cancelled || !group) return
        setSelectedFavoriteGroup(group)
        setSelectedFavoriteGroupKeys(new Set(group.channelKeys))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsRestoringFavoriteGroup(false)
      })

    return () => {
      cancelled = true
    }
  }, [browseFilter, selectedFavoriteGroup])

  // Every channel that belongs to at least one group, so the group action can
  // say whether it will start a membership or change existing ones.
  useEffect(() => {
    if (!userId) return

    const syncGroupedKeys = () => {
      const groups = getCachedFavoriteGroups()
      if (!groups) return
      setGroupedChannelKeys(
        new Set(groups.flatMap((group) => group.channelKeys)),
      )
    }

    loadFavoriteGroups()
      .then(syncGroupedKeys)
      .catch(() => {})
    return subscribeToFavoriteGroups(syncGroupedKeys)
  }, [userId])

  // Membership edits go through the shared cache, so a channel removed from the
  // group currently being browsed leaves the list immediately.
  useEffect(() => {
    if (browseFilter.type !== "favoriteGroup") return

    const groupId = browseFilter.groupId
    return subscribeToFavoriteGroups(() => {
      const group = getCachedFavoriteGroups()?.find(
        (entry) => entry.id === groupId,
      )
      if (!group) return
      setSelectedFavoriteGroup(group)
      setSelectedFavoriteGroupKeys(new Set(group.channelKeys))
    })
  }, [browseFilter])

  const canReorder =
    browseFilter.type === "favorites" || browseFilter.type === "favoriteGroup"

  // Leaving a reorderable view has to drop the mode, or returning to a
  // category later would land in a mode that view cannot express.
  if (isReordering && !canReorder) {
    setIsReordering(false)
  }

  if (!isReordering && reorderedChannels) {
    setReorderedChannels(null)
  }

  async function persistOrder(channels: PortalChannelWithSource[]) {
    const channelKeys = channels.map(getChannelKey)
    const endpoint =
      browseFilter.type === "favoriteGroup"
        ? `/api/favorite-groups/${browseFilter.groupId}/order`
        : "/api/favorites/order"

    // The saved order is applied to the client's own copy too. Neither cache
    // can be force-reloaded — both return early once populated — so the list
    // would otherwise render its original order until a full page load.
    if (browseFilter.type === "favoriteGroup") {
      reorderFavoriteGroupChannelsLocal(browseFilter.groupId, channelKeys)
    } else {
      reorderFavoritesLocal(channelKeys)
    }

    try {
      const response = await apiFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelKeys }),
      })
      if (!response.ok) throw new Error()
    } catch {
      toast.error("Could not save the new order.")
    }
  }

  const clearLongPress = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  const startLongPress = (channel: PortalChannelWithSource) => {
    if (!isMobileLayout) return

    clearLongPress()
    longPressTimeoutRef.current = setTimeout(() => {
      suppressChannelClickRef.current = true
      setContextChannel(channel)
      longPressTimeoutRef.current = null
    }, 500)
  }

  const clearCategoryLongPress = () => {
    if (categoryLongPressTimeoutRef.current) {
      clearTimeout(categoryLongPressTimeoutRef.current)
      categoryLongPressTimeoutRef.current = null
    }
  }

  const startCategoryLongPress = (category: CategoryEntry) => {
    if (!isMobileLayout || !userId || isManagingCategories) return

    clearCategoryLongPress()
    categoryLongPressTimeoutRef.current = setTimeout(() => {
      suppressCategoryClickRef.current = true
      setCategoryMenuOpen(false)
      setContextCategory(category)
      categoryLongPressTimeoutRef.current = null
    }, 500)
  }

  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current)
      }
      if (categoryLongPressTimeoutRef.current) {
        clearTimeout(categoryLongPressTimeoutRef.current)
      }
    }
  }, [])

  const categoryEntries = useMemo(() => {
    const entries = new Map<string, CategoryEntry>()
    const channelsForCategories = selectedPortalIds.size
      ? allChannels.filter(
          (channel) =>
            channel.portalSource &&
            selectedPortalIds.has(channel.portalSource.id),
        )
      : allChannels

    for (const channel of channelsForCategories) {
      const genre = channel.genre || "Uncategorized"
      const sourceId = channel.portalSource?.id ?? 0
      const key = categoryPreferenceKey(sourceId, genre)
      const current = entries.get(key)
      entries.set(key, {
        sourceId,
        sourceName: channel.portalSource?.name ?? "Manual",
        genre,
        count: (current?.count ?? 0) + 1,
      })
    }
    return [...entries.values()].sort(
      (a, b) =>
        a.genre.localeCompare(b.genre, undefined, { sensitivity: "base" }) ||
        a.sourceName.localeCompare(b.sourceName, undefined, {
          sensitivity: "base",
        }),
    )
  }, [allChannels, selectedPortalIds])

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase()
    if (!q) return categoryEntries
    return categoryEntries.filter(
      (entry) =>
        entry.genre.toLowerCase().includes(q) ||
        entry.sourceName.toLowerCase().includes(q),
    )
  }, [categoryEntries, categorySearch])

  const hiddenCategorySet = useMemo(
    () =>
      new Set(
        hiddenCategories.map((entry) =>
          categoryPreferenceKey(entry.sourceId, entry.category),
        ),
      ),
    [hiddenCategories],
  )

  const visibleCategories = useMemo(
    () =>
      filteredCategories.filter(
        (entry) =>
          !hiddenCategorySet.has(
            categoryPreferenceKey(entry.sourceId, entry.genre),
          ),
      ),
    [filteredCategories, hiddenCategorySet],
  )

  const hiddenCategoriesInList = useMemo(
    () =>
      filteredCategories.filter((entry) =>
        hiddenCategorySet.has(
          categoryPreferenceKey(entry.sourceId, entry.genre),
        ),
      ),
    [filteredCategories, hiddenCategorySet],
  )

  const toggleCategoryVisibility = (category: CategoryEntry) => {
    if (!userId) return

    const categoryKey = categoryPreferenceKey(category.sourceId, category.genre)
    const isHidden = hiddenCategorySet.has(categoryKey)
    setCategoryHidden(
      { sourceId: category.sourceId, category: category.genre },
      !isHidden,
    )

    if (
      !isHidden &&
      browseFilter.type === "category" &&
      browseFilter.genre === category.genre &&
      browseFilter.sourceId === category.sourceId
    ) {
      chooseFilter({ type: "all" })
    }
  }

  const portals = useMemo(() => {
    const uniquePortals = new Map<number, PortalSource>()
    for (const channel of allChannels) {
      if (channel.portalSource) {
        uniquePortals.set(channel.portalSource.id, channel.portalSource)
      }
    }
    return [...uniquePortals.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    )
  }, [allChannels])

  const visibleChannels = useMemo(() => {
    const channelsForSelectedPortals = selectedPortalIds.size
      ? channels.filter(
          (channel) =>
            channel.portalSource &&
            selectedPortalIds.has(channel.portalSource.id),
        )
      : channels

    const visibleCategoryChannels = channelsForSelectedPortals.filter(
      (channel) =>
        !hiddenCategorySet.has(
          categoryPreferenceKey(
            channel.portalSource?.id ?? 0,
            channel.genre || "Uncategorized",
          ),
        ),
    )

    if (browseFilter.type === "all") {
      return visibleCategoryChannels
    }
    // Favourites and groups carry a manual order. Both arrive in that order —
    // a Set preserves insertion order, and a group's channelKeys is an array —
    // but filtering the channel catalogue loses it, so it is reapplied here.
    if (browseFilter.type === "favorites") {
      return sortByKeyOrder(
        visibleCategoryChannels.filter(isChannelFavorited),
        [...favorites],
      )
    }
    if (browseFilter.type === "favoriteGroup") {
      return sortByKeyOrder(
        visibleCategoryChannels.filter((channel) =>
          // Both keys, for the same reason favourites check both: a
          // membership added before this change carries the per-copy key,
          // and a channel can gain a guide id later.
          isFavoriteKeyed(channel, identityKeyOf(channel), (key) =>
            selectedFavoriteGroupKeys.has(key),
          ),
        ),
        selectedFavoriteGroup?.channelKeys ?? [],
      )
    }
    return visibleCategoryChannels.filter(
      (channel) =>
        (channel.genre || "Uncategorized") === browseFilter.genre &&
        (browseFilter.sourceId == null ||
          (channel.portalSource?.id ?? 0) === browseFilter.sourceId),
    )
  }, [
    browseFilter,
    channels,
    favorites,
    hiddenCategorySet,
    identityKeyOf,
    isChannelFavorited,
    selectedFavoriteGroup,
    selectedFavoriteGroupKeys,
    selectedPortalIds,
  ])

  /**
   * One row per channel rather than one per stream.
   *
   * The same channel arrives once from every portal that carries it, so a
   * catalogue of fifteen sources holds fifteen Nickelodeons. Grouped, the row
   * is the channel and the streams sit behind it, which is what makes a source
   * something the app picks rather than something the list makes you pick.
   *
   * Only the display groups. Favourites, ordering and deep links still key on
   * the representative's own channel key, so nothing stored changes shape and
   * this can be turned off without a migration.
   */
  const groupedChannels = useMemo(
    () =>
      groupChannels(visibleChannels).map(
        (group) =>
          orderByChosenSource(group.members, sourceOrder, trustedIds)[0],
      ),
    [sourceOrder, trustedIds, visibleChannels],
  )

  // While reordering, the dragged order wins until the saved order catches up.
  const orderedChannels =
    isReordering && reorderedChannels ? reorderedChannels : visibleChannels

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual intentionally returns imperative helpers for scroll math.
  const rowVirtualizer = useVirtualizer({
    count: groupedChannels.length,
    getScrollElement: () =>
      scrollAreaRef.current?.querySelector<HTMLElement>(
        "[data-slot='scroll-area-viewport']",
      ) ?? null,
    estimateSize: () => 84,
    overscan: 12,
  })

  useEffect(() => {
    rowVirtualizer.scrollToIndex(0)
  }, [groupedChannels, rowVirtualizer])

  const renderedEpgChannels = useMemo(
    () =>
      rowVirtualizer
        .getVirtualItems()
        .map((row) => groupedChannels[row.index])
        .filter(Boolean)
        .map((channel) => ({
          xmltvId: channel.xmltvId ?? "",
          epgSourceId:
            channel.portalSource?.epgMode === "custom"
              ? channel.portalSource.epgSourceId
              : null,
        }))
        .filter((entry) => entry.xmltvId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- virtual items change identity every scroll frame.
    [
      groupedChannels,
      rowVirtualizer.getVirtualItems().length,
      rowVirtualizer.scrollOffset,
    ],
  )
  const nowPlayingById = useEpgNow(renderedEpgChannels)

  const isPortalFiltered =
    selectedPortalIds.size > 0 && selectedPortalIds.size < portals.length
  const contextLogoUrl = contextChannel ? channelLogoUrl(contextChannel) : ""

  return (
    <div
      className={cn(
        "bg-background flex h-full min-w-0 flex-col overflow-hidden",
        !isMobileLayout && "bg-card min-w-80 rounded-2xl",
      )}
    >
      <div
        className={cn(
          // tv-list-header lets the packaged app trim the top padding, which
          // otherwise stacks on top of the status-bar inset.
          "tv-list-header flex flex-col gap-3 p-5 pb-2",
          !isMobileLayout && "p-4 pb-2",
        )}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <PortalHopWordmark />
          {headerControls ? (
            <div
              className={cn(
                "-mr-1 flex shrink-0 items-center gap-1",
                !isMobileLayout && "mr-0",
              )}
            >
              {headerControls}
            </div>
          ) : null}
        </div>
        <InputGroup>
          <InputGroupInput
            placeholder={`Search ${visibleChannels.length.toLocaleString()} channels`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          {portals.length > 1 && isMobileLayout ? (
            <InputGroupAddon align="inline-end">
              {/* Same sheet as Categories, Groups and the account menu: same
                  surface, header and row treatment. Content-sized rather than
                  the categories drawer's fixed 75dvh, since a handful of
                  portals in a three-quarter-height sheet is mostly empty. */}
              <Drawer
                open={portalFilterOpen}
                onOpenChange={setPortalFilterOpen}
                showSwipeHandle
              >
                <DrawerTrigger
                  render={
                    <InputGroupButton
                      aria-label="Filter by portal"
                      className="gap-1"
                    />
                  }
                >
                  <ListFilterIcon />
                  {isPortalFiltered ? (
                    <span className="font-mono tabular-nums">
                      {selectedPortalIds.size}
                    </span>
                  ) : null}
                </DrawerTrigger>
                <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md [--drawer-inset:0.5rem] after:hidden dark:border">
                  <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
                    <DrawerTitle className="text-lg">Portals</DrawerTitle>
                    <DrawerDescription>
                      Choose which sources the channel list draws from.
                    </DrawerDescription>
                  </DrawerHeader>
                  <ScrollArea
                    className="min-h-0 flex-1"
                    viewportTabIndex={-1}
                    viewportClassName="px-4 pt-3 pb-2"
                  >
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                          "hover:bg-accent hover:text-accent-foreground h-9 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-sm font-normal focus-visible:ring-inset",
                          !isPortalFiltered && "bg-accent",
                        )}
                        onClick={() => setSelectedPortalIds(new Set())}
                      >
                        <LayoutGridIcon className={portalIconClassName} />
                        <span className="min-w-0 flex-1 truncate text-left font-mono font-medium tracking-tight">
                          All Portals
                        </span>
                        {!isPortalFiltered ? (
                          <CheckIcon className="size-4 shrink-0" />
                        ) : null}
                      </Button>
                    </div>
                    {portals.map((portal) => {
                      const isSelected = selectedPortalIds.has(portal.id)

                      return (
                        <div
                          key={portal.id}
                          className="flex items-center gap-1"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            className={cn(
                              "hover:bg-accent hover:text-accent-foreground h-9 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-sm font-normal focus-visible:ring-inset",
                              isSelected && "bg-accent",
                            )}
                            onClick={() => togglePortal(portal.id, !isSelected)}
                          >
                            <TvIcon className={portalIconClassName} />
                            <span className="min-w-0 flex-1 truncate text-left font-mono font-medium tracking-tight">
                              {portal.name}
                            </span>
                            {isSelected ? (
                              <CheckIcon className="size-4 shrink-0" />
                            ) : null}
                          </Button>
                        </div>
                      )
                    })}
                  </ScrollArea>
                </DrawerContent>
              </Drawer>
            </InputGroupAddon>
          ) : null}
          {portals.length > 1 && !isMobileLayout ? (
            <InputGroupAddon align="inline-end">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <InputGroupButton
                      aria-label="Filter by portal"
                      className="gap-1"
                    />
                  }
                >
                  <ListFilterIcon />
                  {isPortalFiltered ? (
                    <span className="font-mono tabular-nums">
                      {selectedPortalIds.size}
                    </span>
                  ) : null}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {/* No separator between "All Portals" and the list: the two
                      are one set of choices, and the rule read as a section
                      break that isn't there. Icons take the same tinted
                      treatment as the category list — see portalIconClassName. */}
                  <DropdownMenuGroup>
                    {/* A checkbox item like the rest, not a plain action: with
                        no separator the odd one out looked misaligned, since
                        only the others reserved room for an indicator. Showing
                        it as selected when nothing is filtered also makes the
                        current state readable at a glance. */}
                    <DropdownMenuCheckboxItem
                      checked={!isPortalFiltered}
                      onCheckedChange={() => setSelectedPortalIds(new Set())}
                    >
                      <LayoutGridIcon className={portalIconClassName} />
                      All Portals
                    </DropdownMenuCheckboxItem>
                    {portals.map((portal) => (
                      <DropdownMenuCheckboxItem
                        key={portal.id}
                        checked={selectedPortalIds.has(portal.id)}
                        onCheckedChange={(checked) =>
                          togglePortal(portal.id, checked)
                        }
                      >
                        <TvIcon className={portalIconClassName} />
                        <span className="min-w-0 flex-1 truncate">
                          {portal.name}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <div className="@container flex items-center gap-1.5">
          <Button
            {...chipButtonProps(browseFilter.type === "favorites")}
            onClick={() => chooseFilter({ type: "favorites" })}
          >
            <StarIcon className="size-3.5" />
            Favorites
          </Button>
          <Button
            {...chipButtonProps(browseFilter.type === "all")}
            onClick={() => chooseFilter({ type: "all" })}
          >
            <LayoutGridIcon className="size-3.5" />
            All
          </Button>
          <Drawer
            open={categoryMenuOpen}
            onOpenChange={(open) => {
              setCategoryMenuOpen(open)
              if (!open) setCategorySearch("")
            }}
            swipeDirection={isMobileLayout ? "down" : "left"}
            showSwipeHandle={isMobileLayout}
          >
            <DrawerTrigger
              render={
                <Button
                  ref={categoryTriggerRef}
                  {...chipButtonProps(browseFilter.type === "category", {
                    wide: true,
                    collapsible: true,
                  })}
                  aria-label="Categories"
                >
                  <ShapesIcon className="size-3.5" />
                  <span className={cn("min-w-0 truncate", chipLabelCollapse)}>
                    Categories
                  </span>
                </Button>
              }
            />
            <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:75dvh] dark:border">
              <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
                <div className="flex items-center justify-between gap-3">
                  <DrawerTitle className="text-lg">Categories</DrawerTitle>
                  {userId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={
                        isManagingCategories
                          ? "Finish managing categories"
                          : "Manage categories"
                      }
                      onClick={() =>
                        setIsManagingCategories((current) => !current)
                      }
                    >
                      {isManagingCategories ? (
                        <CheckIcon className="size-4 stroke-[2.25]" />
                      ) : (
                        <PencilIcon className="size-4 stroke-[2.25]" />
                      )}
                    </Button>
                  ) : null}
                </div>
              </DrawerHeader>
              <div className="px-4 pt-4 pb-2">
                <InputGroup>
                  <InputGroupInput
                    placeholder="Find a category"
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                  />
                  <InputGroupAddon align="inline-start">
                    <SearchIcon />
                  </InputGroupAddon>
                </InputGroup>
              </div>
              <ScrollArea
                className="min-h-0 flex-1"
                viewportTabIndex={-1}
                viewportClassName="px-4 pb-2"
              >
                {visibleCategories.length ? (
                  visibleCategories.map((category) => {
                    const isActiveGenre =
                      browseFilter.type === "category" &&
                      browseFilter.genre === category.genre &&
                      browseFilter.sourceId === category.sourceId
                    return (
                      <div
                        key={categoryPreferenceKey(
                          category.sourceId,
                          category.genre,
                        )}
                        // category-row: lets the browser skip rendering the
                        // rows that are off screen. This list runs to hundreds
                        // of entries, most carrying a remote flag image, and
                        // all of it lives inside the sheet that transforms
                        // while you drag it — which is why this drawer stutters
                        // where the groups drawer, a handful of rows, does not.
                        className="category-row flex w-full items-center gap-1"
                      >
                        {/* The row surface sits on the button, so the whole row
                            presses rather than the label scaling inside a fixed
                            background. The hide control stays a sibling — a
                            button cannot be nested in another. */}
                        <Button
                          type="button"
                          variant="ghost"
                          onPointerDown={(event) => {
                            if (event.pointerType === "touch") {
                              startCategoryLongPress(category)
                            }
                          }}
                          onPointerUp={clearCategoryLongPress}
                          onPointerCancel={clearCategoryLongPress}
                          onContextMenu={(event) => event.preventDefault()}
                          onClick={() => {
                            if (suppressCategoryClickRef.current) {
                              suppressCategoryClickRef.current = false
                              return
                            }
                            chooseFilter({
                              type: "category",
                              genre: category.genre,
                              sourceId: category.sourceId,
                            })
                            setCategoryMenuOpen(false)
                            setCategorySearch("")
                          }}
                          className={cn(
                            // ring-inset like the channel rows: the scroll
                            // viewport clips anything drawn outside a row, and
                            // padding it away would push the first category off
                            // the top of the list.
                            // Fixed height, like the groups drawer's rows: the
                            // manage toggle changes what a row contains, and a
                            // content-sized row would resize the whole list
                            // when it does.
                            "hover:bg-accent hover:text-accent-foreground h-9 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-sm font-normal focus-visible:ring-inset",
                            isActiveGenre && "bg-accent",
                          )}
                        >
                          <CategoryVisual
                            category={category.genre}
                            className="text-primary"
                            iconClassName="dark:brightness-90 brightness-75"
                          />
                          <span className="min-w-0 flex-1 truncate text-left font-mono font-medium tracking-tight">
                            {category.genre}
                          </span>
                          {isManagingCategories ? null : (
                            <span className="text-muted-foreground shrink-0 pl-2 font-mono text-xs tabular-nums">
                              {category.count.toLocaleString()}
                            </span>
                          )}
                        </Button>
                        {isManagingCategories ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="-mr-1 shrink-0"
                            aria-label={`Hide ${category.genre} from ${category.sourceName}`}
                            onClick={() => toggleCategoryVisibility(category)}
                          >
                            <EyeIcon className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    )
                  })
                ) : (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    No categories match.
                  </p>
                )}
                {isManagingCategories && hiddenCategoriesInList.length ? (
                  <div className="mt-4 border-t pt-3">
                    <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">
                      Hidden categories
                    </p>
                    {hiddenCategoriesInList.map((category) => (
                      <div
                        key={categoryPreferenceKey(
                          category.sourceId,
                          category.genre,
                        )}
                        className="category-row text-muted-foreground flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm"
                      >
                        <CategoryVisual category={category.genre} />
                        <span className="min-w-0 flex-1 truncate font-mono font-medium tracking-tight">
                          {category.genre}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="-mr-1 shrink-0"
                          aria-label={`Show ${category.genre} from ${category.sourceName}`}
                          onClick={() => toggleCategoryVisibility(category)}
                        >
                          <EyeOffIcon className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {!isManagingCategories && hiddenCategoriesInList.length ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground mt-3 h-auto w-full justify-start gap-2 rounded-md px-2 py-2 text-sm font-normal focus-visible:ring-inset"
                    onClick={() => setIsManagingCategories(true)}
                  >
                    <EyeOffIcon className="size-4" />
                    <span>
                      Hidden categories ({hiddenCategoriesInList.length})
                    </span>
                  </Button>
                ) : null}
              </ScrollArea>
            </DrawerContent>
          </Drawer>
          <FavoriteGroupsDrawer
            activeGroupId={
              browseFilter.type === "favoriteGroup"
                ? browseFilter.groupId
                : null
            }
            isMobileLayout={isMobileLayout}
            onDeleteGroup={(groupId) => {
              if (
                browseFilter.type !== "favoriteGroup" ||
                browseFilter.groupId !== groupId
              ) {
                return
              }
              setSelectedFavoriteGroupKeys(new Set())
              setSelectedFavoriteGroup(null)
              chooseFilter({ type: "all" })
            }}
            onSelectGroup={(group) => {
              setSelectedFavoriteGroupKeys(new Set(group.channelKeys))
              setSelectedFavoriteGroup(group)
              chooseFilter({ type: "favoriteGroup", groupId: group.id })
            }}
            userId={userId}
          />
        </div>
        <Drawer
          open={contextCategory !== null}
          onOpenChange={(open) => {
            if (!open) setContextCategory(null)
          }}
          showSwipeHandle
        >
          <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md [--drawer-inset:0.5rem] after:hidden dark:border">
            {contextCategory ? (
              <div className="flex flex-col gap-4 p-4 pt-2">
                <div className="flex min-w-0 items-center gap-3">
                  <CategoryVisual
                    category={contextCategory.genre}
                    className="text-primary size-8"
                    iconClassName="dark:brightness-90 brightness-75"
                  />
                  <div className="min-w-0 flex-1">
                    <DrawerTitle className="truncate text-left">
                      {contextCategory.genre}
                    </DrawerTitle>
                    <DrawerDescription className="text-left">
                      {contextCategory.sourceName} ·{" "}
                      {contextCategory.count.toLocaleString()} channels
                    </DrawerDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full justify-center gap-2"
                  onClick={() => {
                    toggleCategoryVisibility(contextCategory)
                    setContextCategory(null)
                  }}
                >
                  {hiddenCategorySet.has(
                    categoryPreferenceKey(
                      contextCategory.sourceId,
                      contextCategory.genre,
                    ),
                  ) ? (
                    <EyeOffIcon />
                  ) : (
                    <EyeIcon />
                  )}
                  {hiddenCategorySet.has(
                    categoryPreferenceKey(
                      contextCategory.sourceId,
                      contextCategory.genre,
                    ),
                  )
                    ? "Show category"
                    : "Hide category"}
                </Button>
              </div>
            ) : null}
          </DrawerContent>
        </Drawer>
      </div>
      {browseFilter.type === "category" ? (
        <div className="ml-0.5 flex items-center gap-2 px-4 pt-2 pb-1">
          <CategoryVisual
            category={browseFilter.genre}
            className="text-muted-foreground size-4 shrink-0"
          />
          <span className="text-md min-w-0 flex-1 truncate font-semibold">
            {browseFilter.genre}
          </span>
        </div>
      ) : null}
      {/* One banner for both orderable views. The reorder toggle lives here
          rather than in a channel's own menu: the order belongs to the list,
          not to any channel in it, and this row only exists where there is an
          order to change. */}
      {canReorder
        ? (() => {
            const inGroup =
              browseFilter.type === "favoriteGroup" && selectedFavoriteGroup
            const BannerIcon = inGroup
              ? getFavoriteGroupIcon(selectedFavoriteGroup.icon)
              : StarIcon
            return (
              <div className="ml-0.5 flex items-center gap-2 px-4 pt-2 pb-1">
                <BannerIcon className="text-muted-foreground size-4 shrink-0" />
                <span className="text-md min-w-0 flex-1 truncate font-semibold">
                  {inGroup ? selectedFavoriteGroup.name : "Favorites"}
                </span>
                {/* Shown whenever the view has an order, rather than gated on
                having two rows: a control that comes and goes with the channel
                count reads as missing rather than as not-yet-useful. */}
                {visibleChannels.length ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-pressed={isReordering}
                    aria-label={
                      isReordering ? "Finish reordering" : "Reorder channels"
                    }
                    onClick={() => setIsReordering((current) => !current)}
                    className="text-muted-foreground -mr-1 shrink-0"
                  >
                    {isReordering ? (
                      <CheckIcon className="size-4 stroke-[2.25]" />
                    ) : (
                      <ArrowUpDownIcon className="size-4 stroke-[2.25]" />
                    )}
                  </Button>
                ) : null}
              </div>
            )
          })()
        : null}
      <ScrollArea
        ref={scrollAreaRef}
        className="min-h-0 flex-1 px-3 pb-2"
        aria-rowcount={visibleChannels.length}
      >
        {isReordering && visibleChannels.length ? (
          // Un-virtualized on purpose: dragging across a windowed list unmounts
          // rows out from under the cursor. These lists are hand-curated and
          // short, so rendering them whole for the duration of a drag is fine.
          <Sortable
            value={orderedChannels}
            onValueChange={setReorderedChannels}
            getItemValue={getChannelKey}
            onValueCommit={(next) => void persistOrder(next)}
            onDragStart={() => {
              lastDragOverIdRef.current = null
            }}
            onDragOver={(event) => {
              const overId = event.over?.id ? String(event.over.id) : null

              // The dragged row counts as being over itself, which is not a
              // pass, and dnd-kit reports the same row repeatedly while the
              // pointer stays within it.
              if (
                !overId ||
                overId === String(event.active.id) ||
                overId === lastDragOverIdRef.current
              ) {
                return
              }

              lastDragOverIdRef.current = overId
              triggerHaptic("light")
            }}
            className="flex flex-col gap-1.5 py-[3px]"
          >
            {orderedChannels.map((channel, index) => {
              const channelBadgeId = channel.xmltvId ?? ""
              // The channel's, not this stream's, so the row agrees with the
              // header above the player and neither moves when the default
              // source does.
              const logoUrl = channelLogoUrl(channel)
              return (
                <SortableItem
                  key={getChannelKey(channel)}
                  value={getChannelKey(channel)}
                  // The same surface a channel row uses, so reordering looks
                  // like rearranging the list rather than editing a different
                  // one. Only the play targets and the actions menu are gone —
                  // neither means anything mid-drag — and the handle takes the
                  // space the menu had.
                  // The overlay portals a copy of this row to document.body,
                  // outside the panel, so a row with no surface of its own
                  // renders transparent over the page while dragging. Matching
                  // the panel keeps it looking like the row it came from.
                  className={cn(
                    "h-[78px] rounded-xl",
                    isMobileLayout ? "bg-background" : "bg-card",
                  )}
                >
                  {/* The handle is the row. SortableItem keeps its drag
                      listeners in context for a handle to claim, so wrapping
                      the whole row in one makes all of it draggable rather than
                      just the grip. */}
                  <SortableItemHandle className="flex h-full w-full cursor-grab items-center gap-1 rounded-xl pr-1 pl-2 active:cursor-grabbing">
                    <div className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm">
                      {logoUrl ? (
                        <ChannelLogo url={logoUrl} />
                      ) : (
                        <div
                          className="border-border/60 flex h-11 w-[66px] shrink-0 items-center justify-center border bg-[#181a14]"
                          style={{ borderRadius: 10 }}
                        >
                          <TvIcon className="text-muted-foreground size-[18px]" />
                        </div>
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="truncate font-medium">
                          {channel.name ||
                            `Channel ${channel.number || index + 1}`}
                        </span>
                        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
                          <CategoryVisual
                            category={channel.genre || "Uncategorized"}
                            className="size-3 shrink-0"
                          />
                          <span className="truncate">
                            {channel.genre || "Uncategorized"}
                          </span>
                        </span>
                        {channel.portalSource || channelBadgeId ? (
                          <span className="flex min-w-0 items-center gap-1.5">
                            {channel.portalSource ? (
                              <Badge
                                variant="outline"
                                className="h-4 max-w-28 rounded px-1.5 text-[10px]"
                              >
                                <span className="truncate">
                                  {channel.portalSource.name}
                                </span>
                              </Badge>
                            ) : null}
                            {channelBadgeId ? (
                              <Badge
                                variant="secondary"
                                className="h-4 min-w-0 !shrink rounded px-1.5 font-mono text-[10px]"
                              >
                                <span className="truncate">
                                  {channelBadgeId}
                                </span>
                              </Badge>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-muted-foreground flex size-8 shrink-0 items-center justify-center">
                      <GripVerticalIcon className="size-4" />
                    </span>
                  </SortableItemHandle>
                </SortableItem>
              )
            })}
          </Sortable>
        ) : visibleChannels.length ? (
          <div
            className="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const channel = groupedChannels[virtualRow.index]
              const channelKey = getChannelKey(channel)
              const canResolve = canResolveChannel(channel)
              const slug = channelSlug(channel)
              const isSelected = activeSlug === slug
              const isFavorited = isChannelFavorited(channel)
              const channelLabel = `Play ${channel.name || `channel ${channel.number || virtualRow.index + 1}`}`
              // The channel's, not this stream's, so the row agrees with the
              // header above the player and neither moves when the default
              // source does.
              const logoUrl = channelLogoUrl(channel)
              // Already the guide's name where the guide knows it:
              // /api/portals/[id] overlays it before the row ever exists.
              // Nothing to resolve here, which is the point — a name worked
              // out after the row is drawn is a name the row has to correct.
              const displayName = channel.name
              const channelBadgeId = channel.xmltvId ?? ""
              const nowPlaying = nowPlayingById.get(
                normalizeXmltvId(channel.xmltvId),
              )
              const nowProgress = nowPlaying
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      ((Date.now() - nowPlaying.startAt) /
                        (nowPlaying.stopAt - nowPlaying.startAt)) *
                        100,
                    ),
                  )
                : 0

              return (
                <div
                  key={`${channel.id}-${channel.number}-${virtualRow.index}`}
                  className={cn(
                    "group absolute inset-x-0",
                    isSelected && "z-10",
                  )}
                  style={{
                    height: `${virtualRow.size - 6}px`,
                    transform: `translateY(${virtualRow.start + 3}px)`,
                  }}
                >
                  <div
                    className={cn(
                      // Press feedback follows the row's own navigation target
                      // rather than the group: :active propagates up from any
                      // descendant, so keying off the group made the whole row
                      // shrink when the actions button was pressed — feedback
                      // for a press that does not navigate anywhere. The button
                      // carries its own active:scale from the Button variant.
                      //
                      // `scale` must be named in the transition list; Tailwind
                      // v4 emits the standalone `scale` property, so `transform`
                      // does not cover it and the change would snap.
                      // An open actions menu anchors to its row, so the row has
                      // to stay lit once the pointer moves into the floating
                      // menu. Matching hover exactly was not enough: under an
                      // elevated popup a 80%-opacity fill reads as nothing, so
                      // the open state borrows the selected row's fuller
                      // treatment instead.
                      "group-hover:bg-accent/80 has-[button[aria-expanded=true]]:bg-accent pointer-events-none flex h-full items-center gap-1 rounded-xl pr-1 pl-2 transition-[background-color,box-shadow,scale] duration-100 ease-out has-[[data-row-target]:active]:scale-[0.99] has-[button[aria-expanded=true]]:shadow-xs",
                      isSelected && "bg-accent shadow-xs",
                    )}
                  >
                    {canResolve ? (
                      <>
                        <button
                          type="button"
                          data-row-target
                          aria-label={channelLabel}
                          onPointerDown={(event) => {
                            if (event.pointerType === "touch") {
                              startLongPress(channel)
                            }
                          }}
                          onPointerUp={clearLongPress}
                          onPointerCancel={clearLongPress}
                          onContextMenu={(event) => event.preventDefault()}
                          onClick={() => {
                            if (suppressChannelClickRef.current) {
                              suppressChannelClickRef.current = false
                              return
                            }
                            router.push(channelHref(slug))
                          }}
                          className={cn(
                            "focus-visible:ring-ring/50 pointer-events-auto absolute inset-0 z-0 rounded-xl border-0 bg-transparent p-0 focus-visible:ring-[3px] focus-visible:outline-none focus-visible:ring-inset",
                            !isMobileLayout && "hidden",
                          )}
                        />
                        <Link
                          href={channelHref(slug)}
                          data-row-target
                          aria-label={channelLabel}
                          className={cn(
                            "focus-visible:ring-ring/50 pointer-events-auto absolute inset-0 z-0 rounded-xl focus-visible:ring-[3px] focus-visible:outline-none focus-visible:ring-inset",
                            isMobileLayout ? "hidden" : "block",
                          )}
                        />
                      </>
                    ) : null}
                    <div className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm">
                      {logoUrl ? (
                        <ChannelLogo url={logoUrl} />
                      ) : (
                        <div
                          className="border-border/60 flex h-11 w-[66px] shrink-0 items-center justify-center border bg-[#181a14]"
                          style={{ borderRadius: 10 }}
                        >
                          <TvIcon className="text-muted-foreground size-[18px]" />
                        </div>
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="truncate font-medium">
                          {displayName ||
                            `Channel ${channel.number || virtualRow.index + 1}`}
                        </span>
                        {/* What is on now beats what genre the portal filed the
                            channel under, so it takes the two lines rather than
                            pushing the row to four. */}
                        {nowPlaying ? (
                          <>
                            {/* The mobile row's treatment, figure for figure:
                                13 points, medium, and dimmed against a name at
                                full strength. Both lines carry the same weight,
                                so it is size and colour that order them — and
                                the colour is what stops two lines of one weight
                                reading as a single block. */}
                            <span className="text-foreground/80 truncate text-[13px] font-medium">
                              {nowPlaying.title}
                            </span>
                            {/* Mono and medium, as the mobile row has them.
                                Even digits keep the bar between the two times
                                from twitching as the clock advances, and medium
                                is what stops ten-point mono going spidery. */}
                            <span className="text-muted-foreground flex min-w-0 items-center gap-2 font-mono text-[10px] font-medium tabular-nums">
                              <span className="shrink-0">
                                {formatClockTime(nowPlaying.startAt)}
                              </span>
                              {/* Not bg-muted: it is the same token as the row's
                                  hover fill, so the track vanished on hover. */}
                              <span className="bg-foreground/15 h-1 min-w-0 flex-1 overflow-hidden rounded-full">
                                <span
                                  className="bg-primary block h-full rounded-full"
                                  style={{ width: `${nowProgress}%` }}
                                />
                              </span>
                              <span className="shrink-0">
                                {formatClockTime(nowPlaying.stopAt)}
                              </span>
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
                              <CategoryVisual
                                category={channel.genre || "Uncategorized"}
                                className="size-3 shrink-0"
                              />
                              <span className="truncate">
                                {channel.genre || "Uncategorized"}
                              </span>
                            </span>
                            {channel.portalSource || channelBadgeId ? (
                              <span className="flex min-w-0 items-center gap-1.5">
                                {channel.portalSource ? (
                                  <Badge
                                    variant="outline"
                                    className="h-4 max-w-28 rounded px-1.5 text-[10px]"
                                  >
                                    <span className="truncate">
                                      {channel.portalSource.name}
                                    </span>
                                  </Badge>
                                ) : null}
                                {channelBadgeId ? (
                                  <Badge
                                    variant="secondary"
                                    className="h-4 min-w-0 !shrink rounded px-1.5 font-mono text-[10px]"
                                  >
                                    <span className="truncate">
                                      {channelBadgeId}
                                    </span>
                                  </Badge>
                                ) : null}
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "pointer-events-auto relative z-10 size-8 shrink-0 items-center justify-center",
                        isMobileLayout ? "hidden" : "flex",
                      )}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                              aria-label={`Actions for ${displayName || "channel"}`}
                            />
                          }
                        >
                          <MoreVerticalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              className="py-1.5 whitespace-nowrap"
                              onClick={() =>
                                toggleFavorite(favoriteKeyFor(channel))
                              }
                            >
                              <StarIcon
                                className={cn(
                                  isFavorited && "fill-current text-amber-500",
                                )}
                              />
                              {isFavorited
                                ? "Remove from favorites"
                                : "Add to favorites"}
                            </DropdownMenuItem>
                            {userId ? (
                              <DropdownMenuItem
                                className="py-1.5 whitespace-nowrap"
                                onClick={() =>
                                  setGroupMembershipChannel(channel)
                                }
                              >
                                {groupedChannelKeys.has(channelKey) ? (
                                  <FolderHeartIcon />
                                ) : (
                                  <FolderPlusIcon />
                                )}
                                {groupedChannelKeys.has(channelKey)
                                  ? "Edit groups"
                                  : "Add to groups"}
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : isRestoringFavoriteGroup &&
          browseFilter.type === "favoriteGroup" ? (
          <div aria-label="Loading group channels">
            <ChannelRowSkeletons count={14} />
          </div>
        ) : (
          <Empty className="h-40">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {browseFilter.type === "favorites" ? (
                  <StarIcon />
                ) : (
                  <SearchIcon />
                )}
              </EmptyMedia>
              <EmptyTitle>
                {browseFilter.type === "favorites"
                  ? "No favorites yet"
                  : "No channels found"}
              </EmptyTitle>
              <EmptyDescription>
                {browseFilter.type === "favorites"
                  ? "Star channels to see them here."
                  : "No channels matched the current filter."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ScrollArea>
      <Drawer
        open={Boolean(contextChannel)}
        onOpenChange={(open) => {
          if (!open) setContextChannel(null)
        }}
        showSwipeHandle
      >
        <DrawerContent className="rounded-xl [--drawer-inset:0.5rem] after:hidden dark:border">
          <DrawerHeader>
            <DrawerTitle className="sr-only">Channel options</DrawerTitle>
          </DrawerHeader>
          {contextChannel ? (
            <div className="flex flex-col gap-4 p-4 pt-0">
              <div className="flex min-w-0 items-center gap-3 text-left">
                <div className="border-border/60 flex size-11 shrink-0 items-center justify-center overflow-clip rounded-lg border bg-zinc-900 p-1">
                  {contextLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Portal/EPG logos can come from arbitrary hosts.
                    <img
                      src={contextLogoUrl}
                      alt=""
                      className="size-full rounded-[6px] object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <TvIcon className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate font-medium">
                    {contextChannel.name || "Channel"}
                  </span>
                  <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
                    <CategoryVisual
                      category={contextChannel.genre || "Uncategorized"}
                      className="size-3 shrink-0"
                    />
                    <span className="truncate">
                      {contextChannel.genre || "Uncategorized"}
                    </span>
                  </span>
                  {contextChannel.portalSource || contextChannel.xmltvId ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                      {contextChannel.portalSource ? (
                        <Badge
                          variant="outline"
                          className="h-4 max-w-28 rounded px-1.5 text-[10px]"
                        >
                          <span className="truncate">
                            {contextChannel.portalSource.name}
                          </span>
                        </Badge>
                      ) : null}
                      {contextChannel.xmltvId ? (
                        <Badge
                          variant="secondary"
                          className="h-4 min-w-0 !shrink rounded px-1.5 font-mono text-[10px]"
                        >
                          <span className="truncate">
                            {contextChannel.xmltvId}
                          </span>
                        </Badge>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </div>
              {/* Favourite always renders; groups need a signed-in user and the
                  guide match needs a saved channel row, so the count is 1, 2 or
                  3. Giving favourite its own row and sizing the second row to
                  what is left means no case leaves an empty cell — and it puts
                  the action people actually come here for on top. */}
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full justify-center gap-2"
                  onClick={() => {
                    const isFavorited = isChannelFavorited(contextChannel)
                    toggleFavorite(favoriteKeyFor(contextChannel))
                    if (!isFavorited) {
                      triggerHaptic("medium")
                    }
                    setContextChannel(null)
                  }}
                >
                  <StarIcon
                    className={cn(
                      "size-4",
                      // Same as the desktop menu: filled amber reads as "this
                      // is saved" at a glance, where a fill in the button's own
                      // text colour is easy to miss.
                      isChannelFavorited(contextChannel) &&
                        "fill-current text-amber-500",
                    )}
                  />
                  {isChannelFavorited(contextChannel)
                    ? "Remove from favorites"
                    : "Add to favorites"}
                </Button>
                {userId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full justify-center gap-2"
                    onClick={() => {
                      setGroupMembershipChannel(contextChannel)
                      setContextChannel(null)
                    }}
                  >
                    {groupedChannelKeys.has(getChannelKey(contextChannel)) ? (
                      <FolderHeartIcon />
                    ) : (
                      <FolderPlusIcon />
                    )}
                    {groupedChannelKeys.has(getChannelKey(contextChannel))
                      ? "Edit groups"
                      : "Add to groups"}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
      <GroupMembershipDrawer
        channel={
          groupMembershipChannel
            ? {
                // Same key a favourite uses, so a group membership
                // belongs to the channel rather than to whichever
                // portal it was added from.
                key: favoriteKeyFor(groupMembershipChannel),
                name: groupMembershipChannel.name || "Channel",
              }
            : null
        }
        isMobileLayout={isMobileLayout}
        onOpenChange={(open) => {
          if (!open) setGroupMembershipChannel(null)
        }}
      />
    </div>
  )
}
