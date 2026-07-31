"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useWebHaptics } from "web-haptics/react"
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  FolderPlusIcon,
  LayoutGridIcon,
  ListFilterIcon,
  MoreVerticalIcon,
  PencilIcon,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { CategoryVisual } from "@/components/category-visual"
import { PortalHopWordmark } from "@/components/portal-hop-wordmark"
import {
  FavoriteGroupsDrawer,
  getFavoriteGroupIcon,
  GroupMembershipDrawer,
  loadFavoriteGroups,
  type FavoriteGroup,
} from "@/components/tv/favorite-groups-drawer"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import {
  canResolveChannel,
  getChannelKey,
  getChannelLogoUrl,
  type PortalChannelWithSource,
  type PortalSource,
} from "@/lib/tv-channels"
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

function chipButtonProps(active: boolean, options?: { wide?: boolean }) {
  return {
    variant: active ? ("default" as const) : ("outline" as const),
    size: "sm" as const,
    className: cn(
      "rounded-full",
      options?.wide ? "min-w-0 max-w-full shrink!" : "max-w-40 shrink-0",
      !active && "text-muted-foreground",
    ),
  }
}

export function ChannelList({ headerControls }: { headerControls?: ReactNode }) {
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
    isChannelFavorited,
    toggleFavorite,
    favorites,
    epgChannels,
    customEpgChannels,
    useImageProxy,
    channelSlug,
    hiddenCategories,
    setCategoryHidden,
    userId,
  } = useTv()

  const params = useParams<{ channelId?: string }>()
  const router = useRouter()
  const activeSlug = params?.channelId
  const isMobileLayout = useMediaQuery("(max-width: 939px)", true)
  const { trigger: triggerHaptic } = useWebHaptics()

  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const categoryTriggerRef = useRef<HTMLButtonElement>(null)
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const suppressChannelClickRef = useRef(false)
  const categoryLongPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const suppressCategoryClickRef = useRef(false)
  const [contextChannel, setContextChannel] =
    useState<PortalChannelWithSource | null>(null)
  const [groupMembershipChannel, setGroupMembershipChannel] =
    useState<PortalChannelWithSource | null>(null)
  const [contextCategory, setContextCategory] = useState<CategoryEntry | null>(
    null,
  )
  const [isManagingCategories, setIsManagingCategories] = useState(false)
  const [selectedFavoriteGroupKeys, setSelectedFavoriteGroupKeys] = useState<
    Set<string>
  >(() => new Set())
  const [selectedFavoriteGroup, setSelectedFavoriteGroup] =
    useState<FavoriteGroup | null>(null)

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

    return () => {
      cancelled = true
    }
  }, [browseFilter, selectedFavoriteGroup])

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
    if (browseFilter.type === "favorites") {
      return visibleCategoryChannels.filter(isChannelFavorited)
    }
    if (browseFilter.type === "favoriteGroup") {
      return visibleCategoryChannels.filter((channel) =>
        selectedFavoriteGroupKeys.has(getChannelKey(channel)),
      )
    }
    return visibleCategoryChannels.filter(
      (channel) =>
        (channel.genre || "Uncategorized") === browseFilter.genre &&
        (browseFilter.sourceId == null ||
          (channel.portalSource?.id ?? 0) === browseFilter.sourceId),
    )
  }, [browseFilter, channels, hiddenCategorySet, isChannelFavorited, selectedFavoriteGroupKeys, selectedPortalIds])

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual intentionally returns imperative helpers for scroll math.
  const rowVirtualizer = useVirtualizer({
    count: visibleChannels.length,
    getScrollElement: () =>
      scrollAreaRef.current?.querySelector<HTMLElement>(
        "[data-slot='scroll-area-viewport']",
      ) ?? null,
    estimateSize: () => 84,
    overscan: 12,
  })

  useEffect(() => {
    rowVirtualizer.scrollToIndex(0)
  }, [visibleChannels, rowVirtualizer])

  const isPortalFiltered =
    selectedPortalIds.size > 0 && selectedPortalIds.size < portals.length
  const contextLogoUrl = contextChannel
    ? getChannelLogoUrl(
      contextChannel,
      contextChannel.portalSource,
      epgChannels,
      customEpgChannels,
      useImageProxy,
    )
    : ""

  return (
    <div className="bg-background flex h-full min-w-0 flex-col overflow-hidden min-[940px]:min-w-80 min-[940px]:rounded-2xl min-[940px]:bg-card">
      <div className="flex flex-col gap-3 p-5 pb-2 min-[940px]:p-4 min-[940px]:pb-2">
        <div className="mb-1 flex items-center justify-between gap-3">
          <PortalHopWordmark />
          {headerControls ? (
            <div className="-mr-1 flex shrink-0 items-center gap-1 min-[940px]:mr-0">
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
          {portals.length > 1 ? (
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
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() => setSelectedPortalIds(new Set())}
                    >
                      <LayoutGridIcon />
                      All Portals
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {portals.map((portal) => (
                      <DropdownMenuCheckboxItem
                        key={portal.id}
                        checked={selectedPortalIds.has(portal.id)}
                        onCheckedChange={(checked) =>
                          togglePortal(portal.id, checked)
                        }
                      >
                        <TvIcon />
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
        <div className="flex flex-wrap items-center gap-1.5">
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
                  })}
                >
                  <ShapesIcon className="size-3.5" />
                  <span className="min-w-0 truncate">Categories</span>
                </Button>
              }
            />
            <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:75dvh]">
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
                        key={categoryPreferenceKey(category.sourceId, category.genre)}
                        className={cn(
                          "hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                          isManagingCategories ? "py-1" : "py-2",
                          isActiveGenre && "bg-accent",
                        )}
                      >
                        <button
                          type="button"
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
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <CategoryVisual
                            category={category.genre}
                            className="text-primary"
                            iconClassName="dark:brightness-90 brightness-75"
                          />
                          <span className="min-w-0 flex-1 truncate font-mono font-medium tracking-tight">
                            {category.genre}
                          </span>
                        </button>
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
                        ) : (
                          <span className="text-muted-foreground ml-auto shrink-0 pl-2 font-mono text-xs tabular-nums">
                            {category.count.toLocaleString()}
                          </span>
                        )}
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
                        key={categoryPreferenceKey(category.sourceId, category.genre)}
                        className="text-muted-foreground flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm"
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
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm"
                    onClick={() => setIsManagingCategories(true)}
                  >
                    <EyeOffIcon className="size-4" />
                    <span>
                      Hidden categories ({hiddenCategoriesInList.length})
                    </span>
                  </button>
                ) : null}
              </ScrollArea>
            </DrawerContent>
          </Drawer>
          <FavoriteGroupsDrawer
            activeGroupId={
              browseFilter.type === "favoriteGroup" ? browseFilter.groupId : null
            }
            isMobileLayout={isMobileLayout}
            onDeleteGroup={(groupId) => {
              if (browseFilter.type !== "favoriteGroup" || browseFilter.groupId !== groupId) {
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
          <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md [--drawer-inset:0.5rem] after:hidden">
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
                      {contextCategory.sourceName} · {contextCategory.count.toLocaleString()} channels
                    </DrawerDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2"
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
        <div className="ml-0.5 flex items-center gap-2 px-4 pb-1 pt-2">
          <CategoryVisual
            category={browseFilter.genre}
            className="text-muted-foreground size-4 shrink-0"
          />
          <span className="text-md min-w-0 flex-1 truncate font-semibold">
            {browseFilter.genre}
          </span>
        </div>
      ) : null}
      {browseFilter.type === "favoriteGroup" && selectedFavoriteGroup ? (() => {
        const GroupIcon = getFavoriteGroupIcon(selectedFavoriteGroup.icon)
        return (
          <div className="ml-0.5 flex items-center gap-2 px-4 pb-1 pt-2">
            <GroupIcon className="text-muted-foreground size-4 shrink-0" />
            <span className="text-md min-w-0 flex-1 truncate font-semibold">
              {selectedFavoriteGroup.name}
            </span>
          </div>
        )
      })() : null}
      <ScrollArea
        ref={scrollAreaRef}
        className="min-h-0 flex-1 px-3 pb-2"
        aria-rowcount={visibleChannels.length}
      >
        {visibleChannels.length ? (
          <div
            className="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const channel = visibleChannels[virtualRow.index]
              const channelKey = getChannelKey(channel)
              const canResolve = canResolveChannel(channel)
              const slug = channelSlug(channel)
              const isSelected = activeSlug === slug
              const isFavorited = isChannelFavorited(channel)
              const channelLabel = `Play ${channel.name || `channel ${channel.number || virtualRow.index + 1}`}`
              const logoUrl = getChannelLogoUrl(
                channel,
                channel.portalSource,
                epgChannels,
                customEpgChannels,
                useImageProxy,
              )
              const channelBadgeId = channel.xmltvId ?? ""

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
                      "group-hover:bg-accent/80 has-[button[aria-expanded=true]]:bg-accent/80 pointer-events-none flex h-full items-center gap-1 rounded-xl pr-1 pl-2 transition-[background-color,box-shadow,transform] duration-100 ease-out group-active:scale-[0.99]",
                      isSelected && "bg-accent shadow-xs",
                    )}
                  >
                    {canResolve ? (
                      <>
                        <button
                          type="button"
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
                            router.push(`/tv/${slug}`)
                          }}
                          className="focus-visible:ring-ring/50 pointer-events-auto absolute inset-0 z-0 rounded-xl border-0 bg-transparent p-0 focus-visible:ring-[3px] focus-visible:outline-none focus-visible:ring-inset min-[940px]:hidden"
                        />
                        <Link
                          href={`/tv/${slug}`}
                          aria-label={channelLabel}
                          className="focus-visible:ring-ring/50 pointer-events-auto absolute inset-0 z-0 hidden rounded-xl focus-visible:ring-[3px] focus-visible:outline-none focus-visible:ring-inset min-[940px]:block"
                        />
                      </>
                    ) : null}
                    <div className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm">
                      <div className="border-border/60 flex size-11 shrink-0 items-center justify-center overflow-clip rounded-lg border bg-zinc-900 p-1">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- Portal/EPG logos can come from arbitrary hosts.
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
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-medium">
                          {channel.name ||
                            `Channel ${channel.number || virtualRow.index + 1}`}
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
                    <div className="pointer-events-auto relative z-10 hidden size-8 shrink-0 items-center justify-center min-[940px]:flex">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                              aria-label={`Actions for ${channel.name || "channel"}`}
                            />
                          }
                        >
                          <MoreVerticalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              className="py-1.5 whitespace-nowrap"
                              onClick={() => toggleFavorite(channelKey)}
                            >
                              <StarIcon
                                className={cn(
                                  isFavorited && "fill-current text-amber-500",
                                )}
                              />
                              {isFavorited ? "Remove from favorites" : "Add to favorites"}
                            </DropdownMenuItem>
                            {userId ? (
                              <DropdownMenuItem
                                className="py-1.5 whitespace-nowrap"
                                onClick={() => setGroupMembershipChannel(channel)}
                              >
                                <FolderPlusIcon />
                                Add to groups
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
        <DrawerContent className="[--drawer-inset:0.5rem] rounded-xl after:hidden">
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
                <div className="flex min-w-0 flex-1 flex-col gap-1">
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
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  const isFavorited = isChannelFavorited(contextChannel)
                  toggleFavorite(getChannelKey(contextChannel))
                  if (!isFavorited) {
                    void triggerHaptic([{ duration: 15 }], { intensity: 0.4 })
                  }
                  setContextChannel(null)
                }}
              >
                <StarIcon
                  className={cn(
                    "size-4",
                    isChannelFavorited(contextChannel) && "fill-current",
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
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setGroupMembershipChannel(contextChannel)
                    setContextChannel(null)
                  }}
                >
                  <FolderPlusIcon />
                  Add to groups
                </Button>
              ) : null}
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
      <GroupMembershipDrawer
        channel={
          groupMembershipChannel
            ? {
              key: getChannelKey(groupMembershipChannel),
              name: groupMembershipChannel.name || "Channel",
            }
            : null
        }
        isMobileLayout={isMobileLayout}
        onChannelFavorited={(channelKey) => {
          if (!favorites.has(channelKey)) toggleFavorite(channelKey)
        }}
        onOpenChange={(open) => {
          if (!open) setGroupMembershipChannel(null)
        }}
      />
    </div>
  )
}
