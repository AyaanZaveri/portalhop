import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Text, TextInput, View } from "react-native"
import { BottomSheetModal } from "@gorhom/bottom-sheet"
import { FlashList } from "@shopify/flash-list"
import { router } from "expo-router"
import { ListFilter, Rabbit, Search, Tv } from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { channelSlug, getChannelKey } from "@/lib/channel-keys"
import { usePortalChannels, usePortals, type PortalChannelWithSource } from "@/lib/channels"
import { useSession } from "@/lib/auth"
import { useTheme } from "@/lib/theme"
import { PortalFilterSheet } from "@/components/portal-filter-sheet"
import { ThemeToggle } from "@/components/theme-toggle"
import { PressableScale } from "@/components/ui/pressable-scale"
import { ChannelRow } from "@/components/channel-row"

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

  const { data: portals, error: portalsError } = usePortals(signedIn)
  // First cut loads one source. Merging every enabled source is the next step;
  // it needs the same enabled-ids logic the web provider has.
  const activePortal = useMemo(() => {
    if (!portals?.length) return undefined
    if (!selectedPortalIds.size) return portals[0]
    return portals.find((p) => selectedPortalIds.has(p.id)) ?? portals[0]
  }, [portals, selectedPortalIds])

  const {
    data: channels,
    isPending: channelsPending,
    error: channelsError,
  } = usePortalChannels(activePortal)

  // Loud on purpose while the data layer is new: a silent empty list gives no
  // clue whether the request failed, returned nothing, or was never made.
  useEffect(() => {
    console.log(
      `[portalhop] signedIn=${signedIn} portals=${portals?.length ?? "—"} ` +
        `active=${activePortal?.name ?? "none"} channels=${channels?.length ?? "—"}` +
        (portalsError ? ` portalsError=${portalsError.message}` : "") +
        (channelsError ? ` channelsError=${channelsError.message}` : ""),
    )
  }, [signedIn, portals, activePortal, channels, portalsError, channelsError])

  const visible = useMemo<PortalChannelWithSource[]>(() => {
    const list = (channels ?? []).map((channel) => ({
      ...channel,
      portalSource: activePortal
        ? { id: activePortal.id, name: activePortal.name }
        : undefined,
    }))
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((channel) => channel.name.toLowerCase().includes(q))
  }, [channels, query, activePortal])

  const openChannel = useCallback((channel: PortalChannelWithSource) => {
    router.push(`/tv/${encodeURIComponent(channelSlug(channel))}`)
  }, [])

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
                ? `No channels in ${activePortal?.name ?? "this source"}.`
                : "No sources yet — add one on the web app."}
          </Text>
        </View>
      ) : (
        <FlashList
          data={visible}
          keyExtractor={getChannelKey}
          renderItem={({ item }) => (
            <ChannelRow channel={item} onPress={openChannel} />
          )}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 12,
          }}
        />
      )}

      <PortalFilterSheet
        ref={filterSheet}
        portals={portals ?? []}
        selectedIds={selectedPortalIds}
        onChange={setSelectedPortalIds}
      />
    </View>
  )
}
