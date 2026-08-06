import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Text, TextInput, View } from "react-native"
import { BottomSheetModal } from "@gorhom/bottom-sheet"
import { FlashList } from "@shopify/flash-list"
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
import { usePortalChannels, usePortals, type PortalChannelWithSource } from "@/lib/channels"
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
import { useTheme } from "@/lib/theme"
import { CategoriesSheet } from "@/components/categories-sheet"
import { GroupsSheet } from "@/components/groups-sheet"
import { PortalFilterSheet } from "@/components/portal-filter-sheet"
import { Chip } from "@/components/ui/chip"
import { ThemeToggle } from "@/components/theme-toggle"
import { PressableScale } from "@/components/ui/pressable-scale"
import { ChannelRow } from "@/components/channel-row"

// Module scope so FlashList sees the same function every render.
const channelKey = (channel: PortalChannelWithSource) => channel.key

export default function ChannelListScreen() {
  const insets = useSafeAreaInsets()
  const { colors, iconPrimary } = useTheme()
  const { data: session, isPending: sessionPending } = useSession()
  const signedIn = Boolean(session?.user)

  const [query, setQuery] = useState("")
  const [selectedPortalIds, setSelectedPortalIds] = useState<Set<number>>(
    () => new Set(),
  )
  const filterSheet = useRef<BottomSheetModal>(null)
  const categoriesSheet = useRef<BottomSheetModal>(null)
  const groupsSheet = useRef<BottomSheetModal>(null)
  const [filter, setFilter] = useState<BrowseFilter>({ type: "all" })

  const { data: portals, error: portalsError } = usePortals(signedIn)

  // An empty selection means "All Portals", not "none" — the sheet offers it as
  // the default and every source should be in view until one is singled out.
  const activePortals = useMemo(() => {
    if (!portals?.length) return []
    if (!selectedPortalIds.size) return portals
    return portals.filter((portal) => selectedPortalIds.has(portal.id))
  }, [portals, selectedPortalIds])

  const {
    channels: withSource,
    isPending: channelsPending,
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
  }, [signedIn, portals, activePortals, withSource, portalsError, channelsError])

  // Derived from everything in the source, not from what the chip currently
  // shows — otherwise picking a category would empty the category list.
  const categories = useCategories(withSource)

  const visible = useMemo(() => {
    const filtered = applyBrowseFilter(withSource, filter, favorites, groups)
    const q = query.trim().toLowerCase()
    if (!q) return filtered
    return filtered.filter((channel) => channel.searchName.includes(q))
  }, [withSource, filter, favorites, groups, query])

  const openChannel = useCallback((channel: PortalChannelWithSource) => {
    router.push(`/tv/${encodeURIComponent(channelSlug(channel))}`)
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

  const listPadding = useMemo(
    () => ({ paddingHorizontal: 12, paddingBottom: insets.bottom + 12 }),
    [insets.bottom],
  )

  // Duplicate keys are the other thing FlashList blames for that warning, and
  // 44k channels across 12 sources is exactly where a collision would hide.
  // Checked once per data change in development so it is a log line rather
  // than a mystery.
  useEffect(() => {
    if (!__DEV__ || !visible.length) return
    const seen = new Set<string>()
    let duplicates = 0
    for (const channel of visible) {
      if (seen.has(channel.key)) duplicates++
      else seen.add(channel.key)
    }
    if (duplicates) {
      console.warn(
        `[portalhop] ${duplicates} duplicate channel keys of ${visible.length} — FlashList will not settle with these`,
      )
    }
  }, [visible])

  if (sessionPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    )
  }

  if (!signedIn) {
    return (
      <View
        className="flex-1 items-center justify-center gap-4 bg-background px-8"
        style={{ paddingTop: insets.top }}
      >
        <Text className="font-heading text-lg text-foreground">
          Sign in to Portal Hop
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          Your sources and favourites live on your account.
        </Text>
        <PressableScale
          className="mt-2 h-11 w-full items-center justify-center rounded-lg bg-primary"
          onPress={() => router.push("/sign-in")}
        >
          <Text className="font-medium text-primary-foreground">Sign in</Text>
        </PressableScale>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* The wordmark is gone: a native app does not need to tell you which app
          you just opened, and the space is better spent on content. The bunny
          stays as a small brand mark. */}
      <View className="gap-3 px-4 pt-1 pb-2">
        <View className="h-10 flex-row items-center gap-2">
          <Rabbit size={22} color={iconPrimary} />
          <Text
            className="flex-1 font-heading text-[22px] tracking-tight text-foreground"
            style={{ includeFontPadding: false }}
          >
            Channels
          </Text>
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
            className="flex-1 font-sans text-[15px] text-foreground"
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
            className="font-mono-medium text-sm tracking-tight text-foreground"
          >
            {filter.type === "category"
              ? filter.genre
              : (groups?.find((g) => g.id === filter.groupId)?.name ?? "Group")}
          </Text>
        ) : null}
      </View>

      {/* Surfaced rather than swallowed: an empty list and a failed request
          look identical otherwise, which is exactly the case worth telling
          apart while the data layer is new. */}
      {portalsError || channelsError ? (
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <Text className="text-center font-medium text-destructive">
            Couldn&apos;t load channels
          </Text>
          <Text className="text-center text-xs text-muted-foreground">
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
          <Text className="text-center text-sm text-muted-foreground">
            {query
              ? "No channels match."
              : portals?.length
                ? "No channels in the selected sources."
                : "No sources yet — add one on the web app."}
          </Text>
        </View>
      ) : (
        <FlashList
          data={visible}
          keyExtractor={channelKey}
          renderItem={renderChannel}
          contentContainerStyle={listPadding}
        />
      )}

      <PortalFilterSheet
        ref={filterSheet}
        portals={portals ?? []}
        selectedIds={selectedPortalIds}
        onChange={setSelectedPortalIds}
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
  )
}
