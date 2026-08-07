import { useCallback, useEffect, useState } from "react"
import { ScrollView, Text, View } from "react-native"
import Sortable from "react-native-sortables"
import * as Haptics from "expo-haptics"
import { GripVertical } from "lucide-react-native"
import { Image } from "expo-image"
import { Tv } from "lucide-react-native"

import type { PortalChannelWithSource } from "@/lib/channels"
import { useReorderChannels } from "@/lib/mutations"
import { useTheme } from "@/lib/theme"
import { CategoryVisual } from "@/components/category-visual"
import { CHANNEL_ROW_HEIGHT } from "@/components/channel-row"

/**
 * The favourites list, in drag-to-reorder mode.
 *
 * A separate component from the browsing list rather than a mode inside it.
 * Only favourites and groups can be ordered, and those are tens of rows, so
 * this can use an ordinary ScrollView; the browsing list carries tens of
 * thousands and has to stay on FlashList, which does not virtualise a
 * reorderable list well anyway.
 *
 * Rows here are deliberately plainer than in the list — no guide strip, no
 * press target. In this mode the only thing a row does is move.
 */
export function ChannelReorderList({
  channels,
  groupId,
  bottomInset,
}: {
  channels: PortalChannelWithSource[]
  /** Omitted when reordering the plain favourites list. */
  groupId?: number
  bottomInset: number
}) {
  const { colors } = useTheme()
  const reorder = useReorderChannels()

  // The dragged order is held locally and shown until the save lands, so the
  // rows do not snap back to the server's order between drop and response.
  const [order, setOrder] = useState(channels)

  useEffect(() => {
    setOrder(channels)
  }, [channels])

  const onDragEnd = useCallback(
    ({ data }: { data: PortalChannelWithSource[] }) => {
      setOrder(data)
      reorder.mutate({
        groupId,
        channelKeys: data.map((channel) => channel.key),
      })
    },
    [groupId, reorder],
  )

  const renderItem = useCallback(
    ({ item }: { item: PortalChannelWithSource }) => {
      const logo = item.logoUrl || item.logo

      return (
        <View
          className="mb-0.5 flex-row items-center gap-3 rounded-xl px-2"
          style={{ height: CHANNEL_ROW_HEIGHT }}
        >
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
              className="text-foreground text-[15px] font-medium tracking-tight"
              style={{ lineHeight: 19, includeFontPadding: false }}
            >
              {item.name || "Channel"}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                marginTop: 2,
              }}
            >
              <CategoryVisual
                category={item.genre || "Uncategorized"}
                size={12}
              />
              <Text
                numberOfLines={1}
                className="text-muted-foreground flex-1 text-xs"
                style={{ lineHeight: 15, includeFontPadding: false }}
              >
                {item.genre || "Uncategorized"}
              </Text>
            </View>
          </View>

          {/* Says the row can be moved. The whole row is the drag target, so
              this is a signpost rather than the only place to grab. */}
          <GripVertical size={18} color={colors["muted-foreground"]} />
        </View>
      )
    },
    [colors],
  )

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 12,
        paddingBottom: bottomInset + 12,
      }}
    >
      {/* Layer lifts the dragged row above its neighbours; without it the row
          being moved slides under the ones it passes. */}
      <Sortable.Layer>
        <Sortable.Grid
          columns={1}
          data={order}
          keyExtractor={(channel) => channel.key}
          renderItem={renderItem}
          rowGap={2}
          // On by default, and it re-centres the row under the finger the
          // moment it is picked up — grab the handle on the right and the whole
          // row jumps left to meet your thumb. The row should stay exactly
          // where it was and follow from there.
          enableActiveItemSnap={false}
          onDragEnd={onDragEnd}
          onDragStart={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          }}
          // A tick each time the row passes another, so the reordering is felt
          // as it happens rather than only confirmed at the drop.
          // selectionAsync rather than an impact: it is the lightest thing
          // either platform offers, and this fires on every row passed — an
          // impact at that rate would buzz.
          onOrderChange={() => {
            void Haptics.selectionAsync()
          }}
        />
      </Sortable.Layer>
    </ScrollView>
  )
}
