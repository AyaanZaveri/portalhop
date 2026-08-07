import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Text, TextInput, View } from "react-native"
import { BottomSheetModal } from "@gorhom/bottom-sheet"
import { FlashList, type FlashListRef } from "@shopify/flash-list"
import { useQueryClient } from "@tanstack/react-query"
import { router } from "expo-router"
import {
  FolderHeart,
  LayoutGrid,
  ListFilter,
  Rabbit,
  Search,
  Shapes,
  Star,
  Tv,
} from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { channelSlug } from "@/lib/channel-keys"
import {
  usePortalChannels,
  usePortals,
  type PortalChannelWithSource,
} from "@/lib/channels"
import {
  applyBrowseFilter,
  useCategories,
  useFavoriteGroups,
  useFavorites,
  type CategoryEntry,
  type FavoriteGroup,
} from "@/lib/filters"
import type { BrowseFilter } from "@portalhop/shared/browse-filter"
import { useSession } from "@/lib/auth"
import { loadSelectedPortalIds, saveSelectedPortalIds } from "@/lib/preferences"
import { useTheme } from "@/lib/theme"
import { CategoriesSheet } from "@/components/categories-sheet"
import { GroupsSheet } from "@/components/groups-sheet"
import { PortalFilterSheet } from "@/components/portal-filter-sheet"
import { Chip } from "@/components/ui/chip"
import { ThemeToggle } from "@/components/theme-toggle"
import { PressableScale } from "@/components/ui/pressable-scale"
import { ChannelRow } from "@/components/channel-row"
import { invalidateFeeds } from "@/lib/epg"
import { EpgProvider } from "@/components/epg-provider"
import { PullToRefresh } from "@/components/pull-to-refresh"

// Module scope so FlashList sees the same function and object every render.
const channelKey = (channel: PortalChannelWithSource) => channel.key
const MAINTAIN_POSITION = { disabled: true }

export default function ChannelListScreen() {
  const insets = useSafeAreaInsets()
  const { colors, iconPrimary } = useTheme()
  const { data: session, isPending: sessionPending } = useSession()
  const signedIn = Boolean(session?.user)

  const [query, setQuery] = useState("")
  const [selectedPortalIds, setSelectedPortalIds] = useState<Set<number>>(
    () => new Set(),
  )
  // Nothing is fetched until the saved selection has been read back, otherwise
  // the first frame would start downloading every portal on the "all" default
  // and only then discover the user had narrowed it down.
  const [portalsHydrated, setPortalsHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadSelectedPortalIds().then((ids) => {
      if (cancelled) return
      setSelectedPortalIds(ids)
      setPortalsHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Pull to refresh.
   *
   * Only the three small queries are invalidated, never the catalogues
   * directly. A catalogue is keyed by its source's updatedAt, so re-reading the
   * portal list is what discovers that a source changed — and then only the
   * sources that actually did refetch. Invalidating them by hand would pull
   * roughly 9MB down every time the user tugged the list, to arrive at the same
   * answer.
   */
  const queryClient = useQueryClient()

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portals"] }),
        queryClient.invalidateQueries({ queryKey: ["favorites"] }),
        queryClient.invalidateQueries({ queryKey: ["favorite-groups"] }),
        // The guide too. It has its own store outside TanStack, so
        // invalidating queries left it alone — pulling the list did nothing
        // for a channel whose schedule was missing, which is the case most
        // likely to make someone pull in the first place.
        invalidateFeeds(),
      ]),
    [queryClient],
  )

  const changeSelectedPortals = useCallback((ids: Set<number>) => {
    setSelectedPortalIds(ids)
    void saveSelectedPortalIds(ids)
  }, [])
  const filterSheet = useRef<BottomSheetModal>(null)
  const categoriesSheet = useRef<BottomSheetModal>(null)
  const groupsSheet = useRef<BottomSheetModal>(null)
  const [filter, setFilter] = useState<BrowseFilter>({ type: "all" })

  const { data: portals, error: portalsError } = usePortals(signedIn)

  // An empty selection means "All Portals", not "none" — the sheet offers it as
  // the default and every source should be in view until one is singled out.
  const activePortals = useMemo(() => {
    if (!portals?.length || !portalsHydrated) return []
    if (!selectedPortalIds.size) return portals
    return portals.filter((portal) => selectedPortalIds.has(portal.id))
  }, [portals, selectedPortalIds, portalsHydrated])

  const {
    channels: withSource,
    byKey,
    isPending: channelsPending,
    isFetching: channelsFetching,
    error: channelsError,
  } = usePortalChannels(activePortals)

  const { favorites } = useFavorites(signedIn)
  const { data: groups } = useFavoriteGroups(signedIn)

  // Loud on purpose while the data layer is new: a silent empty list gives no
  // clue whether the request failed, returned nothing, or was never made.
  useEffect(() => {
    console.log(
      `[portalhop] signedIn=${signedIn} portals=${portals?.length ?? "—"} ` +
        `active=${activePortals.length} channels=${withSource.length}` +
        (portalsError ? ` portalsError=${portalsError.message}` : "") +
        (channelsError ? ` channelsError=${channelsError.message}` : ""),
    )
  }, [
    signedIn,
    portals,
    activePortals,
    withSource,
    portalsError,
    channelsError,
  ])

  // Derived from everything in the source, not from what the chip currently
  // shows — otherwise picking a category would empty the category list.
  const categories = useCategories(withSource)

  const visible = useMemo(() => {
    const filtered = applyBrowseFilter(
      withSource,
      byKey,
      filter,
      favorites,
      groups,
    )
    const q = query.trim().toLowerCase()
    if (!q) return filtered
    return filtered.filter((channel) => channel.searchName.includes(q))
  }, [withSource, byKey, filter, favorites, groups, query])

  // The guide id and name ride along as params rather than being looked up
  // again on the other side: resolving a slug back to a channel would mean
  // rebuilding the merged catalogue on a screen that needs one row from it.
  const openChannel = useCallback((channel: PortalChannelWithSource) => {
    router.push({
      pathname: "/tv/[slug]",
      params: {
        slug: channelSlug(channel),
        xmltvId: channel.xmltvId ?? "",
        name: channel.name ?? "",
        channelId: channel.id ?? "",
        portalId: String(channel.portalSource?.id ?? ""),
        // What /api/channel-link resolves a stream from, so the portal's
        // credentials and stream command never leave the server.
        savedChannelId: String(channel.savedChannelId ?? ""),
        // For the header, so it can draw the channel before any request
        // resolves rather than popping in a logo a moment later.
        logo: channel.logoUrl || channel.logo || "",
        genre: channel.genre || "",
        portalName: channel.portalSource?.name ?? "",
      },
    })
  }, [])

  // Every prop below is held stable on purpose. FlashList re-renders its
  // internals when a prop changes by reference, and with a list this size an
  // inline renderItem or style object is enough to send it into a loop that
  // never commits — which is what "Exceeded max renders without commit" was.
  const renderChannel = useCallback(
    ({ item }: { item: PortalChannelWithSource }) => (
      <ChannelRow channel={item} onPress={openChannel} />
    ),
    [openChannel],
  )

  // Each filter is a different list, so it starts where a list starts. Without
  // this the scroll offset carries over, and switching from a scrolled position
  // in All to a short Favorites lands somewhere arbitrary in it — or past its
  // end, which is the other way blank space appears.
  const listRef = useRef<FlashListRef<PortalChannelWithSource>>(null)

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [filter, query])

  // Which rows the guide should be fetched and queried for. Only these — a
  // catalogue this size spans many countries, and downloading every one of
  // their guide files would be tens of megabytes for schedules the user has
  // not scrolled to.
  const [visibleRows, setVisibleRows] = useState<PortalChannelWithSource[]>([])

  const onViewableItemsChanged = useRef(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{ item: PortalChannelWithSource }>
    }) => {
      setVisibleRows(viewableItems.map((entry) => entry.item))
    },
  ).current

  // FlashList treats this as fixed for the life of the list and warns if it
  // changes, so it is built once rather than inline.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current

  const listPadding = useMemo(
    () => ({ paddingHorizontal: 12, paddingBottom: insets.bottom + 12 }),
    [insets.bottom],
  )

  // Duplicate keys are the other thing FlashList blames for that warning, and
  // 44k channels across 12 sources is exactly where a collision would hide.
  // Checked once per data change in development so it is a log line rather
  // than a mystery.
  // Checked against the merged catalogue rather than the filtered list: a
  // collision can only come from merging sources, and hanging this off `visible`
  // meant a full pass over every row each time a filter changed — a development
  // cost on precisely the interaction that needs to stay quick.
  useEffect(() => {
    if (!__DEV__ || !withSource.length) return
    const seen = new Set<string>()
    let duplicates = 0
    for (const channel of withSource) {
      if (seen.has(channel.key)) duplicates++
      else seen.add(channel.key)
    }
    if (duplicates) {
      console.warn(
        `[portalhop] ${duplicates} duplicate channel keys of ${withSource.length} — FlashList will not settle with these`,
      )
    }
  }, [withSource])

  if (sessionPending) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    )
  }

  if (!signedIn) {
    return (
      <View
        className="bg-background flex-1 items-center justify-center gap-4 px-8"
        style={{ paddingTop: insets.top }}
      >
        <Text className="font-heading text-foreground text-lg">
          Sign in to Portal Hop
        </Text>
        <Text className="text-muted-foreground text-center text-sm">
          Your sources and favourites live on your account.
        </Text>
        <PressableScale
          className="bg-primary mt-2 h-11 w-full items-center justify-center rounded-lg"
          onPress={() => router.push("/sign-in")}
        >
          <Text className="text-primary-foreground font-medium">Sign in</Text>
        </PressableScale>
      </View>
    )
  }

  return (
    <EpgProvider channels={withSource} portals={portals} visible={visibleRows}>
      <View className="bg-background flex-1" style={{ paddingTop: insets.top }}>
        {/* The wordmark is gone: a native app does not need to tell you which app
          you just opened, and the space is better spent on content. The bunny
          stays as a small brand mark. */}
        <View className="gap-3 px-4 pt-1 pb-2">
          <View className="h-10 flex-row items-center gap-2">
            <Rabbit size={22} color={iconPrimary} />
            <Text
              className="font-heading text-foreground text-[22px] tracking-tight"
              style={{ includeFontPadding: false }}
            >
              Channels
            </Text>
            {/* Only while the list already has something to show: during the
              first load the list itself is a spinner, and two at once just
              reads as a stutter. */}
            {channelsFetching && !channelsPending ? (
              <ActivityIndicator
                size="small"
                color={colors["muted-foreground"]}
              />
            ) : null}
            <View className="flex-1" />
            <ThemeToggle />
          </View>

          <View
            className="h-11 flex-row items-center gap-2 rounded-lg border px-3"
            style={{ borderColor: colors.border }}
          >
            {/* lucide's icons take a colour prop rather than a class. Wrapping
              them with Uniwind's withUniwind would allow className here; worth
              doing once there are more than a handful. */}
            <Search size={17} color={colors["muted-foreground"]} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${visible.length.toLocaleString()} channels`}
              className="text-foreground flex-1 font-sans text-[15px]"
              placeholderTextColor={colors["muted-foreground"]}
              autoCorrect={false}
              // Android vertically centres text in a TextInput only when told to,
              // and its default font padding pushes the baseline up besides.
              textAlignVertical="center"
              style={{ paddingVertical: 0, includeFontPadding: false }}
            />
            {portals && portals.length > 1 ? (
              <PressableScale
                preset="icon"
                hitSlop={10}
                onPress={() => filterSheet.current?.present()}
              >
                <ListFilter size={18} color={colors["muted-foreground"]} />
              </PressableScale>
            ) : null}
          </View>

          {/* The same four the web has. Categories and Groups open sheets rather
            than filtering directly, since each needs a list to pick from. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Chip
              label="Favorites"
              icon={Star}
              active={filter.type === "favorites"}
              onPress={() => setFilter({ type: "favorites" })}
            />
            <Chip
              label="All"
              icon={LayoutGrid}
              active={filter.type === "all"}
              onPress={() => setFilter({ type: "all" })}
            />
            <Chip
              label="Categories"
              icon={Shapes}
              active={filter.type === "category"}
              onPress={() => categoriesSheet.current?.present()}
            />
            <Chip
              label="Groups"
              icon={FolderHeart}
              iconOnly
              active={filter.type === "favoriteGroup"}
              onPress={() => groupsSheet.current?.present()}
            />
          </View>

          {/* Which category or group is showing is otherwise invisible once the
            sheet closes — the chip only says that one is active. */}
          {filter.type === "category" || filter.type === "favoriteGroup" ? (
            <Text
              numberOfLines={1}
              className="font-mono-medium text-foreground text-sm tracking-tight"
            >
              {filter.type === "category"
                ? filter.genre
                : (groups?.find((g) => g.id === filter.groupId)?.name ??
                  "Group")}
            </Text>
          ) : null}
        </View>

        {/* Surfaced rather than swallowed: an empty list and a failed request
          look identical otherwise, which is exactly the case worth telling
          apart while the data layer is new. */}
        {portalsError || channelsError ? (
          <View className="flex-1 items-center justify-center gap-2 px-8">
            <Text className="text-destructive text-center font-medium">
              Couldn&apos;t load channels
            </Text>
            <Text className="text-muted-foreground text-center text-xs">
              {(portalsError ?? channelsError)?.message}
            </Text>
          </View>
        ) : channelsPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : visible.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-2 px-8">
            <Tv size={28} color={colors["muted-foreground"]} />
            <Text className="text-muted-foreground text-center text-sm">
              {query
                ? "No channels match."
                : portals?.length
                  ? "No channels in the selected sources."
                  : "No sources yet — add one on the web app."}
            </Text>
          </View>
        ) : (
          <PullToRefresh onRefresh={refresh}>
            {({ onScroll }) => (
              <FlashList
                data={visible}
                keyExtractor={channelKey}
                renderItem={renderChannel}
                contentContainerStyle={listPadding}
                onScroll={onScroll}
              // Without this iOS reports scroll about once a second, which is
              // long enough for the gesture to still believe the list is at
              // the top after it has been scrolled away.
              scrollEventThrottle={16}
                ref={listRef}
                // On by default in v2, and its own known-issues page names this case:
                // it anchors the rows that were on screen when the data changes, so
                // catalogues arriving during load left the list pinned below a gap of
                // empty space. Worth having in a chat, where content grows upward —
                // here every change is a new list that should start at the top.
                maintainVisibleContentPosition={MAINTAIN_POSITION}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
              />
            )}
          </PullToRefresh>
        )}

        <PortalFilterSheet
          ref={filterSheet}
          portals={portals ?? []}
          selectedIds={selectedPortalIds}
          onChange={changeSelectedPortals}
        />

        <CategoriesSheet
          ref={categoriesSheet}
          categories={categories}
          filter={filter}
          onSelect={(category: CategoryEntry) => {
            setFilter({
              type: "category",
              genre: category.genre,
              sourceId: category.sourceId,
            })
            categoriesSheet.current?.dismiss()
          }}
        />

        <GroupsSheet
          ref={groupsSheet}
          groups={groups ?? []}
          filter={filter}
          onSelect={(group: FavoriteGroup) => {
            setFilter({ type: "favoriteGroup", groupId: group.id })
            groupsSheet.current?.dismiss()
          }}
        />
      </View>
    </EpgProvider>
  )
}
