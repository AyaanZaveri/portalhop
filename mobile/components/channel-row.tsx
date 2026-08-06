import { memo } from "react"
import { Text, View } from "react-native"
import { Image } from "expo-image"
import { Tv } from "lucide-react-native"

import type { PortalChannelWithSource } from "@/lib/channels"
import { useTheme } from "@/lib/theme"
import { CategoryVisual } from "@/components/category-visual"
import { PressableScale } from "@/components/ui/pressable-scale"

// Tighter than the web's 84pt row: a phone shows far less at once, so padding
// that reads as comfortable on a desktop list just costs you rows here. 64
// leaves the 44pt logo 10pt of breathing room above and below.
export const CHANNEL_ROW_HEIGHT = 64

export const ChannelRow = memo(function ChannelRow({
  channel,
  onPress,
}: {
  channel: PortalChannelWithSource
  onPress: (channel: PortalChannelWithSource) => void
}) {
  const { colors } = useTheme()
  const logo = channel.logoUrl || channel.logo

  return (
    <PressableScale
      preset="row"
      onPress={() => onPress(channel)}
      className="mb-0.5 flex-row items-center gap-3 rounded-xl px-2"
      style={{ height: CHANNEL_ROW_HEIGHT }}
    >
      <View
        className="size-11 items-center justify-center overflow-hidden border p-1"
        style={{ borderRadius: 10, borderColor: colors.border, backgroundColor: "#18181b" }}
      >
        {logo ? (
          <Image
            source={{ uri: logo }}
            // Radius on the image itself as well as the parent: Android does not
            // reliably clip a child to a rounded parent, so relying on
            // overflow-hidden alone leaves square corners on the logo.
            style={{ width: "100%", height: "100%", borderRadius: 6 }}
            contentFit="contain"
            // Rows are recycled, so tie the cache entry to the channel and skip
            // the fade — a cross-fade on a recycled row reads as a glitch.
            recyclingKey={channel.id}
            transition={0}
          />
        ) : (
          <Tv size={18} color={colors["muted-foreground"]} />
        )}
      </View>

      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className="font-mono-medium text-[15px] tracking-tight text-foreground"
          // RN adds font padding on Android and reserves leading above the
          // glyphs, which is what opened the gap under the channel name.
          style={{ lineHeight: 19, includeFontPadding: false }}
        >
          {channel.name || `Channel ${channel.number}`}
        </Text>
        {/* 2pt of separation on top of the line heights: without it the two
            lines read as one block. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            marginTop: 2,
          }}
        >
          <CategoryVisual category={channel.genre || "Uncategorized"} size={12} />
          <Text
            numberOfLines={1}
            className="flex-1 text-xs text-muted-foreground"
            style={{ lineHeight: 15, includeFontPadding: false }}
          >
            {channel.genre || "Uncategorized"}
          </Text>
        </View>
      </View>
    </PressableScale>
  )
})
