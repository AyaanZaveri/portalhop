import { memo } from "react"
import { Text, View } from "react-native"

import type { PortalChannelWithSource } from "@/lib/channels"
import { useTheme } from "@/lib/theme"
import { useLogoColor } from "@/lib/logo-colors"
import { CategoryVisual } from "@/components/category-visual"
import { ChannelLogo } from "@/components/channel-logo"
import { EpgStrip } from "@/components/epg-strip"
import { useNowPlaying } from "@/components/epg-provider"
import { PressableScale } from "@/components/ui/pressable-scale"

// Tighter than the web's 84pt row: a phone shows far less at once, so padding
// that reads as comfortable on a desktop list just costs you rows here. 72 is
// what the guide case needs — name, programme title, and the times either side
// of the progress bar — with the 44pt logo still clearing it comfortably.
export const CHANNEL_ROW_HEIGHT = 72

export const ChannelRow = memo(function ChannelRow({
  channel,
  onPress,
  onLongPress,
}: {
  channel: PortalChannelWithSource
  onPress: (channel: PortalChannelWithSource) => void
  onLongPress: (channel: PortalChannelWithSource) => void
}) {
  const { colors } = useTheme()
  const logo = channel.logoUrl || channel.logo
  const programme = useNowPlaying(channel.xmltvId)
  // The bar carries the channel's colour, which is the one surface in the row
  // with nothing drawn over it and so nothing for a strong colour to obscure.
  const color = useLogoColor(logo)

  return (
    <PressableScale
      preset="row"
      onPress={() => onPress(channel)}
      onLongPress={() => onLongPress(channel)}
      className="mb-0.5 flex-row items-center gap-3 rounded-xl px-2"
      // Back to one fixed height for every row. Because the guide replaces the
      // category line rather than adding to it, the tall case is three short
      // lines (19 + 15 + 12 plus gaps) and fits inside a single size — so the
      // list keeps uniform rows instead of measuring each one.
      style={{ height: CHANNEL_ROW_HEIGHT }}
    >
      <ChannelLogo uri={logo} recyclingKey={channel.id} />

      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className="font-rounded text-foreground text-[15px] tracking-tight"
          // RN adds font padding on Android and reserves leading above the
          // glyphs, which is what opened the gap under the channel name.
          style={{ lineHeight: 19, includeFontPadding: false }}
        >
          {channel.name || `Channel ${channel.number}`}
        </Text>
        {/* What is on now beats the genre the portal filed the channel under,
            so it takes those lines rather than pushing the row to four — the
            same trade the web makes. 2pt of separation on top of the line
            heights: without it the lines read as one block. */}
        {programme ? (
          <EpgStrip programme={programme} color={color} />
        ) : (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginTop: 2,
            }}
          >
            <CategoryVisual
              category={channel.genre || "Uncategorized"}
              size={12}
              color={colors["muted-foreground"]}
            />
            <Text
              numberOfLines={1}
              className="text-muted-foreground flex-1 text-xs"
              style={{ lineHeight: 15, includeFontPadding: false }}
            >
              {channel.genre || "Uncategorized"}
            </Text>
          </View>
        )}
      </View>
    </PressableScale>
  )
})
