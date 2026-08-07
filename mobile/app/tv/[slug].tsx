import { ScrollView, Text, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { ChevronLeft } from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/lib/theme"
import { useSession } from "@/lib/auth"
import { usePortals } from "@/lib/channels"

import { ChannelSchedule } from "@/components/channel-schedule"
import { PressableScale } from "@/components/ui/pressable-scale"

export default function ChannelDetailScreen() {
  const { name, xmltvId, channelId, portalId } = useLocalSearchParams<{
    slug: string
    name?: string
    xmltvId?: string
    channelId?: string
    portalId?: string
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
      <View className="h-14 flex-row items-center gap-2 px-3">
        <PressableScale
          preset="icon"
          hitSlop={8}
          onPress={() => router.back()}
          className="size-9 items-center justify-center rounded-lg"
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </PressableScale>
        <Text
          numberOfLines={1}
          className="flex-1 font-heading text-base text-foreground"
        >
          {name || "Channel"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Where the player goes. Deferred deliberately: the web player is 4,171
            lines of custom controls, captions and live-latency tuning, and the
            shell is worth judging before taking that on. The guide below is
            positioned for it — the player drops in here without moving. */}
        <View className="mx-3 aspect-video items-center justify-center rounded-lg bg-black">
          <Text className="text-sm text-muted-foreground">Player goes here</Text>
        </View>

        <Text className="px-4 pt-6 pb-3 font-heading text-sm text-foreground">
          Programme Guide
        </Text>

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
