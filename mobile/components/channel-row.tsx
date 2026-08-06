import { memo } from "react"
import { Text, View } from "react-native"
import { Image } from "expo-image"
import { Tv } from "lucide-react-native"

import type { PortalChannelWithSource } from "@/lib/channels"
import { PressableScale } from "@/components/ui/pressable-scale"

// 84pt to match the web list's row height, so the two look the same side by side.
export const CHANNEL_ROW_HEIGHT = 84

export const ChannelRow = memo(function ChannelRow({
  channel,
  onPress,
}: {
  channel: PortalChannelWithSource
  onPress: (channel: PortalChannelWithSource) => void
}) {
  const logo = channel.logoUrl || channel.logo

  return (
    <PressableScale
      preset="row"
      onPress={() => onPress(channel)}
      className="mb-1.5 flex-row items-center gap-3 rounded-xl px-2 py-2"
      style={{ height: CHANNEL_ROW_HEIGHT - 6 }}
    >
      <View className="size-11 items-center justify-center overflow-hidden rounded-lg border border-border bg-zinc-900 p-1">
        {logo ? (
          <Image
            source={{ uri: logo }}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
            // Rows are recycled, so tie the cache entry to the channel and skip
            // the fade — a cross-fade on a recycled row reads as a glitch.
            recyclingKey={channel.id}
            transition={0}
          />
        ) : (
          <Tv size={18} className="text-muted-foreground" />
        )}
      </View>

      <View className="min-w-0 flex-1 gap-1">
        <Text
          numberOfLines={1}
          className="font-mono-medium text-[15px] tracking-tight text-foreground"
        >
          {channel.name || `Channel ${channel.number}`}
        </Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {channel.genre || "Uncategorized"}
        </Text>
      </View>
    </PressableScale>
  )
})
