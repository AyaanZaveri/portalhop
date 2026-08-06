import { Text, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { ChevronLeft } from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { PressableScale } from "@/components/ui/pressable-scale"

export default function ChannelDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const insets = useSafeAreaInsets()

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="h-14 flex-row items-center gap-2 px-3">
        <PressableScale
          preset="icon"
          hitSlop={8}
          onPress={() => router.back()}
          className="size-9 items-center justify-center rounded-lg"
        >
          <ChevronLeft size={22} className="text-foreground" />
        </PressableScale>
        <Text numberOfLines={1} className="flex-1 font-heading text-base text-foreground">
          Channel
        </Text>
      </View>

      {/* Where the player goes. Deferred deliberately: the web player is 4,171
          lines of custom controls, captions and live-latency tuning, and the
          shell is worth judging before taking that on. */}
      <View className="mx-3 aspect-video items-center justify-center rounded-lg bg-black">
        <Text className="text-sm text-muted-foreground">Player goes here</Text>
      </View>

      <Text className="px-4 pt-4 font-mono text-xs text-muted-foreground">
        {slug}
      </Text>
    </View>
  )
}
