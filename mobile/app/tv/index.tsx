import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Text, TextInput, View } from "react-native"
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
  ArrowUpDown,
  Check,
} from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { channelSlug } from "@/lib/channel-keys"
import {
  usePortalChannels,
  usePortals,
  type ChannelWithStreams,
  type PortalChannelWithSource,
} from "@/lib/channels"
import { useChooseChannelSource } from "@/lib/source-order"
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
import {
  loadBrowseFilter,
  loadSelectedPortalIds,
  saveBrowseFilter,
  saveSelectedPortalIds,
} from "@/lib/preferences"
import { longPress, select } from "@/lib/haptics"
import { useTheme } from "@/lib/theme"
import { CategoriesSheet } from "@/components/categories-sheet"
import { GroupsSheet } from "@/components/groups-sheet"
import { PortalFilterSheet } from "@/components/portal-filter-sheet"
import { Chip } from "@/components/ui/chip"
import { OrbScreen } from "@/components/ui/orb"
import { TopGlow } from "@/components/top-glow"
import { ThemeToggle } from "@/components/theme-toggle"
import { PressableScale } from "@/components/ui/pressable-scale"
import { CategoryVisual } from "@/components/category-visual"
import { GroupIcon } from "@/components/group-icon"
import { ChannelRow } from "@/components/channel-row"
import { ChannelReorderList } from "@/components/channel-reorder-list"
import { invalidateFeeds } from "@/lib/epg"
import { ChannelActionsSheet } from "@/components/channel-actions-sheet"
import { ChannelSourcesSheet } from "@/components/channel-sources-sheet"
import { GroupMembershipSheet } from "@/components/group-membership-sheet"
import { EpgProvider, useNowPlayingSearch } from "@/components/epg-provider"
import { PullToRefresh } from "@/components/pull-to-refresh"

// Module scope so FlashList sees the same function and object every render.
const channelKey = (channel: ChannelWithStreams) => channel.key
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
   * Pull to refresh: re-read everything, catalogues included.
   *
   * The catalogues used to be left out, on the reasoning that a source's
   * updatedAt is what says its channels changed, so re-reading the portal list
   * would discover it and nothing else needed pulling. That is true only while
   * updatedAt is a reliable witness, and it left a refresh unable to fix the
   * one thing people pull for.
   *
   * It also went wrong in a way that did not look like a stale catalogue at
   * all: favourites are stored as channel keys and resolved against the
   * catalogue, so a channel favourited elsewhere and missing from the cached
   * copy is dropped on the floor. Favourites appeared not to sync while their
   * ordering plainly did, because reordering only moves keys that are already
   * present.
   *
   * A deliberate pull is worth a real download; it is the one moment the user
   * has said they want current data over fast data.
   */
  const queryClient = useQueryClient()

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portals"] }),
        queryClient.invalidateQueries({ queryKey: ["favorites"] }),
        queryClient.invalidateQueries({ queryKey: ["favorite-groups"] }),
        // Every catalogue, by prefix. invalidateQueries refetches active
        // queries whatever their staleTime, which is what gets past the
        // Infinity these are cached under.
        queryClient.invalidateQueries({ queryKey: ["portal"] }),
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
  const actionsSheet = useRef<BottomSheetModal>(null)
  const membershipSheet = useRef<BottomSheetModal>(null)
  const [actionChannel, setActionChannel] = useState<ChannelWithStreams | null>(
    null,
  )
  const [reordering, setReordering] = useState(false)
  const categoriesSheet = useRef<BottomSheetModal>(null)
  const groupsSheet = useRef<BottomSheetModal>(null)
  const [filter, setFilterState] = useState<BrowseFilter>({ type: "all" })
  // Nothing is written back until the saved chip has been read, or the default
  // this starts on would overwrite the user's choice before it loads.
  const [filterRestored, setFilterRestored] = useState(false)
  const userChoseFilter = useRef(false)

  const setFilter = useCallback(
    (next: BrowseFilter) => {
      userChoseFilter.current = true
      setFilterState(next)
      void saveBrowseFilter(session?.user?.id ?? null, next)
    },
    [session?.user?.id],
  )

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
    streams,
    trustedIds,
    byKey,
    isPending: channelsPending,
    error: channelsError,
  } = usePortalChannels(activePortals)

  const { favorites } = useFavorites(signedIn)
  const { data: groups } = useFavoriteGroups(signedIn)

  // Restores the chip the user was last on, per account.
  useEffect(() => {
    if (sessionPending) return
    let cancelled = false
    void loadBrowseFilter(session?.user?.id ?? null).then((saved) => {
      if (cancelled) return
      if (saved) {
        userChoseFilter.current = true
        setFilterState(saved)
      }
      setFilterRestored(true)
    })
    return () => {
      cancelled = true
    }
  }, [sessionPending, session?.user?.id])

  // With nothing saved, Favorites is the more useful landing place for someone
  // who has any — the same default the web falls back to. Only until the user
  // picks something themselves, after which their choice is what is restored.
  useEffect(() => {
    if (!filterRestored || userChoseFilter.current) return
    setFilterState(
      favorites.keys.length ? { type: "favorites" } : { type: "all" },
    )
  }, [filterRestored, favorites.keys.length])

  // Loud while the data layer was new: a silent empty list gives no clue
  // whether the request failed, returned nothing, or was never made. Behind
  // __DEV__ now, like every other log here — it is a line per catalogue change
  // in a release build, on a screen that holds tens of thousands of them.
  useEffect(() => {
    if (!__DEV__) return
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

  // Only a manually ordered view can be reordered, which is favourites and
  // groups — a category is the portal's order, and there is nowhere to save a
  // rearrangement of it. Leaving one of those views has to drop the mode, or
  // coming back to a category would land in a mode it cannot express.
  const canReorder =
    filter.type === "favorites" || filter.type === "favoriteGroup"

  useEffect(() => {
    if (!canReorder && reordering) setReordering(false)
  }, [canReorder, reordering])

  // Favourites are keys resolved against the catalogue, and a key with no
  // channel behind it is dropped without a word — which is exactly how a stale
  // catalogue disguises itself as favourites not syncing. Worth saying out
  // loud in development rather than diagnosing from the symptom again.
  useEffect(() => {
    if (!__DEV__ || !favorites.keys.length || !byKey.size) return
    const missing = favorites.keys.filter((key) => !byKey.has(key)).length
    if (missing) {
      console.warn(
        `[portalhop] ${missing} of ${favorites.keys.length} favourites have no channel in the loaded catalogues — pull to refresh to re-read them`,
      )
    }
  }, [favorites, byKey])

  // Derived from everything in the source, not from what the chip currently
  // shows — otherwise picking a category would empty the category list.
  const categories = useCategories(streams)

  // Asked of SQLite rather than of the catalogue, debounced, and additive: it
  // arrives after the name matches are already on screen and only ever widens
  // the list.
  const programmeMatches = useNowPlayingSearch(query)

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

    // Three ways to match, and the order they come back in is the ranking.
    // Someone typing "tsn" wants the channel called TSN before every channel
    // showing a programme with "tsn" in the title, so name and id matches keep
    // their catalogue order at the front and guide matches follow.
    const named: ChannelWithStreams[] = []
    const onNow: ChannelWithStreams[] = []

    for (const channel of filtered) {
      if (channel.searchName.includes(q) || channel.searchId.includes(q)) {
        named.push(channel)
      } else if (channel.searchId && programmeMatches.has(channel.searchId)) {
        onNow.push(channel)
      }
    }

    return onNow.length ? named.concat(onNow) : named
  }, [withSource, byKey, filter, favorites, groups, query, programmeMatches])

  // The guide id and name ride along as params rather than being looked up
  // again on the other side: resolving a slug back to a channel would mean
  // rebuilding the merged catalogue on a screen that needs one row from it.
  const openChannel = useCallback(
    (channel: ChannelWithStreams) => {
      router.push({
        pathname: "/tv/[slug]",
        params: {
          slug: channelSlug(channel, trustedIds),
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
          portalName: channel.portalSource?.name ?? "",
        },
      })
    },
    [trustedIds],
  )

  // Every prop below is held stable on purpose. FlashList re-renders its
  // internals when a prop changes by reference, and with a list this size an
  // inline renderItem or style object is enough to send it into a loop that
  // never commits — which is what "Exceeded max renders without commit" was.
  const sourcesSheet = useRef<BottomSheetModal>(null)
  const [sourcesChannel, setSourcesChannel] =
    useState<ChannelWithStreams | null>(null)
  const chooseSource = useChooseChannelSource()

  /**
   * Promotes the tapped stream to the front of its channel's order.
   *
   * Only a channel with a guide id can carry the choice — that is the identity
   * the row is stored against, and a name is one portal's wording, which moves.
   * Streams that were never saved (a preview source) cannot hold a position
   * either, since what is stored is a saved-channel row.
   */
  const onChooseSource = useCallback(
    (channel: ChannelWithStreams, stream: PortalChannelWithSource) => {
      sourcesSheet.current?.dismiss()

      if (!channel.identityKey || stream.savedChannelId == null) return

      chooseSource.mutate({
        identityKey: channel.identityKey,
        savedChannelIds: [
          stream.savedChannelId,
          ...channel.streams
            .filter((entry) => entry.key !== stream.key)
            .map((entry) => entry.savedChannelId),
        ].filter((id): id is number => typeof id === "number"),
      })
    },
    [chooseSource],
  )

  const openActions = useCallback((channel: ChannelWithStreams) => {
    // The platform's own long-press feedback, not an impact. Nothing has
    // landed — a row has been picked out — and impactAsync comes out of Android
    // as a buzz where the packaged web build gives a tick for the same gesture.
    longPress()
    setActionChannel(channel)
    actionsSheet.current?.present()
  }, [])

  const renderChannel = useCallback(
    ({ item }: { item: ChannelWithStreams }) => (
      <ChannelRow
        channel={item}
        onPress={openChannel}
        onLongPress={openActions}
      />
    ),
    [openChannel, openActions],
  )

  // Each filter is a different list, so it starts where a list starts. Without
  // this the scroll offset carries over, and switching from a scrolled position
  // in All to a short Favorites lands somewhere arbitrary in it — or past its
  // end, which is the other way blank space appears.
  const listRef = useRef<FlashListRef<ChannelWithStreams>>(null)

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [filter, query])

  // Which rows the guide should be fetched and queried for. Only these — a
  // catalogue this size spans many countries, and downloading every one of
  // their guide files would be tens of megabytes for schedules the user has
  // not scrolled to.
  const [visibleRows, setVisibleRows] = useState<ChannelWithStreams[]>([])

  const onViewableItemsChanged = useRef(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{ item: ChannelWithStreams }>
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
      <View className="bg-background flex-1">
        <OrbScreen />
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
        <Text className="text-muted-foreground text-center font-sans text-sm">
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
        {/* The app's own colour, which is what TopGlow falls back to, the way
            a channel page wears the channel's. Drawn first so the header sits
            over it without a z-index, and deaf to touches so it cannot swallow
            the search field under it. */}
        <TopGlow />
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

            {/* Pushed to the far end, and kept there whichever orderable view
                is open, so the control has one place rather than moving with
                the heading. The gap is doing real work: this is a mode, not a
                fifth filter, and sitting flush against the chips would read as
                one. */}
            <View className="flex-1" />

            {canReorder ? (
              <PressableScale
                preset="icon"
                hitSlop={10}
                className="size-8 items-center justify-center rounded-lg"
                onPress={() => {
                  select()
                  setReordering((current) => !current)
                }}
              >
                {reordering ? (
                  <Check size={18} color={iconPrimary} />
                ) : (
                  <ArrowUpDown size={18} color={colors["muted-foreground"]} />
                )}
              </PressableScale>
            ) : null}
          </View>

          {/* Only where the chip cannot say which one: the Categories and
              Groups chips name the kind, not the choice. Favourites needs no
              heading — its chip already says the word, and repeating it just
              cost a row of the list. */}
          {filter.type === "category" || filter.type === "favoriteGroup" ? (
            <View className="h-6 flex-row items-center gap-2">
              {filter.type === "favoriteGroup" ? (
                <GroupIcon
                  icon={groups?.find((g) => g.id === filter.groupId)?.icon}
                  size={16}
                  color={colors["muted-foreground"]}
                />
              ) : (
                <CategoryVisual
                  category={filter.genre}
                  size={16}
                  color={colors.foreground}
                />
              )}
              <Text
                numberOfLines={1}
                className="text-foreground flex-1 text-[15px] font-semibold tracking-tight"
              >
                {filter.type === "category"
                  ? filter.genre
                  : (groups?.find((g) => g.id === filter.groupId)?.name ??
                    "Group")}
              </Text>
            </View>
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
            <Text className="text-muted-foreground text-center font-sans text-xs">
              {(portalsError ?? channelsError)?.message}
            </Text>
          </View>
        ) : channelsPending ? (
          <OrbScreen />
        ) : visible.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-2 px-8">
            <Tv size={28} color={colors["muted-foreground"]} />
            <Text className="text-muted-foreground text-center font-sans text-sm">
              {query
                ? "No channels match."
                : portals?.length
                  ? "No channels in the selected sources."
                  : "No sources yet — add one on the web app."}
            </Text>
          </View>
        ) : reordering ? (
          // Reordering replaces the list rather than layering onto it: pull to
          // refresh would fight the drag, and the guide strips and press
          // targets are noise in a mode whose only action is moving a row.
          <ChannelReorderList
            channels={visible}
            storedKeys={
              filter.type === "favoriteGroup"
                ? new Set(
                    groups?.find((group) => group.id === filter.groupId)
                      ?.channelKeys ?? [],
                  )
                : favorites.set
            }
            groupId={
              filter.type === "favoriteGroup" ? filter.groupId : undefined
            }
            bottomInset={insets.bottom}
          />
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

        <ChannelSourcesSheet
          ref={sourcesSheet}
          streams={sourcesChannel?.streams ?? []}
          activeKey={sourcesChannel?.key}
          onChoose={(stream) => {
            if (sourcesChannel) onChooseSource(sourcesChannel, stream)
          }}
        />

        <ChannelActionsSheet
          ref={actionsSheet}
          channel={actionChannel}
          favorites={favorites.set}
          groups={groups}
          signedIn={signedIn}
          onChooseSource={(channel) => {
            // Dismissed first so the two sheets do not overlap mid-animation.
            actionsSheet.current?.dismiss()
            setSourcesChannel(channel)
            setTimeout(() => sourcesSheet.current?.present(), 220)
          }}
          onEditGroups={() => {
            // Dismissed first so the two sheets do not overlap mid-animation.
            actionsSheet.current?.dismiss()
            membershipSheet.current?.present()
          }}
          onClose={() => actionsSheet.current?.dismiss()}
        />

        <GroupMembershipSheet
          ref={membershipSheet}
          channel={actionChannel}
          groups={groups}
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
