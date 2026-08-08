import { memo } from "react"
import { Text, View } from "react-native"
import { Image } from "expo-image"
import { Tv } from "lucide-react-native"

import type { PortalChannelWithSource } from "@/lib/channels"
import { useTheme } from "@/lib/theme"
import { useLogoColor } from "@/lib/logo-colors"
import { CategoryVisual } from "@/components/category-visual"
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
  const { colors, isDark } = useTheme()
  const logo = channel.logoUrl || channel.logo
  const programme = useNowPlaying(channel.xmltvId)
  const tint = useLogoColor(logo)

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
      {/* The channel's own colour, pulled from its logo, so a row is
          recognisable before the name is read.

          Very faint, and fainter in light mode. The row carries a foreground
          title over a muted category line, and the muted one is what sets the
          ceiling — a wash strong enough to look deliberate behind the title
          turns the category to mud. Against a light background a saturated tint
          also reads much heavier at the same alpha, hence the two values.

          Behind the content rather than on the row itself: opacity on the row
          would take the text down with it. */}
      {tint ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: 12,
            backgroundColor: tint,
            opacity: isDark ? 0.16 : 0.1,
          }}
        />
      ) : null}
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
          <EpgStrip programme={programme} />
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
