import { forwardRef } from "react"
import { Text, View } from "react-native"
import {
  BottomSheetFlatList,
  type BottomSheetModal,
} from "@gorhom/bottom-sheet"

import type { PortalChannelWithSource } from "@/lib/channels"
import { useStreamInfo } from "@/lib/stream-info"
import { streamLabels } from "@portalhop/shared/stream-info"
import { select } from "@/lib/haptics"
import { useTheme } from "@/lib/theme"
import { Badge } from "@/components/ui/badge"
import { ChannelLogo } from "@/components/channel-logo"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Sheet } from "@/components/ui/sheet"

/**
 * The streams behind one channel, and which of them plays.
 *
 * Every row shows the portal's own name for the channel and the portal's own
 * artwork, where the row that opened this sheet shows the guide's. That is the
 * whole reason the list is worth reading: the channel's name and mark are
 * identical on every line here by construction, so showing those would be five
 * copies of one row. "SKY SPORTS F1 UHD" against "4K| SKY SPORTS F1" is how
 * someone tells which stream they are choosing.
 *
 * Tapping chooses; there is no dragging. The web can express a whole order —
 * first, then second if that fails — and this expresses the one thing anyone
 * wants on a phone, which is "play that one instead".
 */
export const ChannelSourcesSheet = forwardRef<
  BottomSheetModal,
  {
    /** The streams, the current default first. */
    streams: PortalChannelWithSource[]
    /** Which stream is playing, or would play. */
    activeKey: string | undefined
    onChoose: (stream: PortalChannelWithSource) => void
  }
>(function ChannelSourcesSheet({ streams, activeKey, onChoose }, ref) {
  const { colors } = useTheme()
  // What each of these streams turned out to be, where one has been watched
  // before. This is the screen the readings were collected for: five copies of
  // a channel, and no other way to tell which is the 4K one without opening
  // each in turn.
  const streamInfo = useStreamInfo(streams.length > 1)

  return (
    // No blur on this one. It opens over the player, and a video is a native
    // surface the blur cannot sample -- the page came back blurred everywhere
    // except the picture, which is the one place a viewer is looking.
    <Sheet ref={ref} title="Sources" snapPoints={["55%"]} blur={false}>
      <BottomSheetFlatList
        data={streams}
        keyExtractor={(stream) => stream.key}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        renderItem={({ item }) => {
          const active = item.key === activeKey

          return (
            <PressableScale
              preset="row"
              className="flex-row items-center gap-3 rounded-xl px-2 py-2"
              onPress={() => {
                select()
                onChoose(item)
              }}
            >
              <ChannelLogo
                uri={item.sourceLogoUrl || item.logoUrl || item.logo}
                recyclingKey={item.key}
              />

              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className="text-foreground font-rounded text-[15px] tracking-tight"
                  style={{ lineHeight: 19, includeFontPadding: false }}
                >
                  {item.sourceName || item.name || "Unnamed channel"}
                </Text>
                {/* The portal is a badge like the rest, because it is the same
                    kind of thing: a short fact about this stream. It leads,
                    since it is the one every row has and the one being chosen
                    between; the figures follow, and only for streams somebody
                    has played. A row with none is not claiming to be worse --
                    it is one nobody has opened yet. */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    marginTop: 3,
                  }}
                >
                  <Badge>{item.portalSource?.name ?? "Manual"}</Badge>

                  {streamLabels(
                    item.savedChannelId == null
                      ? undefined
                      : streamInfo[item.savedChannelId],
                  ).map((label) => (
                    <Badge key={label}>{label}</Badge>
                  ))}
                </View>
              </View>

              {/* A dot rather than a filled row. Every line here carries a logo
                  tile in the channel's own colour, so a tinted background would
                  put two fills in one row and the artwork would win. */}
              <View
                className="size-2 rounded-full"
                style={{
                  backgroundColor: active ? colors.primary : "transparent",
                }}
              />
            </PressableScale>
          )
        }}
      />
    </Sheet>
  )
})
