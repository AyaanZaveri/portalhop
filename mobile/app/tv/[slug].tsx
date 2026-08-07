import { ScrollView, Text, View } from "react-native"
import { Image } from "expo-image"
import { router, useLocalSearchParams } from "expo-router"
import { ChevronLeft, Tv } from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/lib/theme"
import { useSession } from "@/lib/auth"
import { usePortals } from "@/lib/channels"

import { CategoryVisual } from "@/components/category-visual"
import { ChannelPlayer } from "@/components/channel-player"
import { ChannelSchedule } from "@/components/channel-schedule"
import { PressableScale } from "@/components/ui/pressable-scale"

export default function ChannelDetailScreen() {
  const {
    name,
    xmltvId,
    channelId,
    portalId,
    savedChannelId,
    logo,
    genre,
    portalName,
  } = useLocalSearchParams<{
    slug: string
    name?: string
    xmltvId?: string
    channelId?: string
    portalId?: string
    savedChannelId?: string
    logo?: string
    genre?: string
    portalName?: string
  }>()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()

  // The portal record carries the EPG mode and, for a Stalker source, the
  // endpoint and credentials the guide request needs. Read from the cached
  // portals query rather than threaded through the route: it is small, already
  // in memory, and passing credentials through a URL would be worse.
  const { data: session } = useSession()
  const { data: portals } = usePortals(Boolean(session?.user))
  const portal = portals?.find((entry) => entry.id === Number(portalId))

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Logo, name, category and source — the same block the web's channel
          header carries, and the same logo treatment as a list row so a
          channel looks like itself on both screens. */}
      <View className="flex-row items-center gap-3 px-3 py-2">
        <PressableScale
          preset="icon"
          hitSlop={8}
          onPress={() => router.back()}
          className="size-9 items-center justify-center rounded-lg"
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </PressableScale>

        <View
          className="size-11 items-center justify-center overflow-hidden border p-1"
          style={{
            borderRadius: 10,
            borderColor: colors.border,
            backgroundColor: "#18181b",
          }}
        >
          {logo ? (
            <Image
              source={{ uri: logo }}
              // Radius on the image as well as the parent: Android does not
              // reliably clip a child to a rounded parent.
              style={{ width: "100%", height: "100%", borderRadius: 6 }}
              contentFit="contain"
              transition={0}
            />
          ) : (
            <Tv size={18} color={colors["muted-foreground"]} />
          )}
        </View>

        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className="font-medium text-[17px] tracking-tight text-foreground"
            style={{ lineHeight: 21, includeFontPadding: false }}
          >
            {name || "Live stream"}
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
            }}
          >
            <CategoryVisual category={genre || "Uncategorized"} size={12} />
            <Text
              numberOfLines={1}
              className="shrink text-xs text-muted-foreground"
              style={{ lineHeight: 15, includeFontPadding: false }}
            >
              {genre || "Uncategorized"}
            </Text>
            {portalName ? (
              // The web's outline Badge. Which source a channel came from
              // matters most here, where you are about to watch it.
              <View
                className="rounded-md border px-1.5"
                style={{ borderColor: colors.border }}
              >
                <Text
                  numberOfLines={1}
                  className="text-[10px] text-muted-foreground"
                  style={{ lineHeight: 15, includeFontPadding: false }}
                >
                  {portalName}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <ChannelPlayer
          sourceId={Number(portalId)}
          savedChannelId={Number(savedChannelId)}
        />

        {/* Icon and weight follow the web's guide heading. */}
        <View className="flex-row items-center gap-2 px-4 pt-6 pb-3">
          {/* Optically centred against the text rather than mathematically:
              the icon's mass sits low next to a cap-height word, so it reads
              as sunk when its box is aligned. The web nudges the same icon by
              the same amount with -mt-0.5. */}
          <Tv
            size={16}
            color={colors["muted-foreground"]}
            style={{ marginTop: -2 }}
          />
          <Text className="font-heading text-base text-foreground">
            Programme Guide
          </Text>
        </View>

        <ChannelSchedule
          portal={portal}
          channelId={channelId}
          channelName={name}
          xmltvId={xmltvId}
        />
      </ScrollView>
    </View>
  )
}
