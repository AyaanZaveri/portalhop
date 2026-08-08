import { forwardRef } from "react"
import { Text, View } from "react-native"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import * as Haptics from "expo-haptics"
import { FolderHeart, FolderPlus, Star } from "lucide-react-native"

import type { PortalChannelWithSource } from "@/lib/channels"
import type { FavoriteGroup } from "@/lib/filters"
import { useToggleFavorite } from "@/lib/mutations"
import { useTheme } from "@/lib/theme"
import { CategoryVisual } from "@/components/category-visual"
import { ChannelLogo } from "@/components/channel-logo"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Sheet } from "@/components/ui/sheet"

/**
 * What a long press on a channel opens.
 *
 * Favourite first and on its own row, then groups — the same order and split
 * the web's mobile sheet uses, because favouriting is what people come here
 * for and burying it in a grid with the rarer actions gets that backwards.
 * The guide-match action the web also offers is not here yet.
 */
export const ChannelActionsSheet = forwardRef<
  BottomSheetModal,
  {
    channel: PortalChannelWithSource | null
    favorites: Set<string>
    groups: FavoriteGroup[] | undefined
    signedIn: boolean
    onEditGroups: (channel: PortalChannelWithSource) => void
    onClose: () => void
  }
>(function ChannelActionsSheet(
  { channel, favorites, groups, signedIn, onEditGroups, onClose },
  ref,
) {
  const { colors, iconPrimary } = useTheme()
  const toggleFavorite = useToggleFavorite()

  const favorited = channel ? favorites.has(channel.key) : false
  const grouped = channel
    ? Boolean(groups?.some((group) => group.channelKeys.includes(channel.key)))
    : false
  const logo = channel?.logoUrl || channel?.logo

  return (
    <Sheet ref={ref}>
      {/* A plain View: the shell already wraps a dynamically sized sheet in
          the BottomSheetView it measures, and nesting another inside it would
          measure the heading out of the height again. */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {channel ? (
          <>
            {/* The same identity block the row shows, so it is obvious which
                channel the actions below are about. */}
            <View className="flex-row items-center gap-3 pb-4">
              <ChannelLogo uri={logo} />

              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className="text-foreground font-rounded text-[15px] tracking-tight"
                  style={{ lineHeight: 19, includeFontPadding: false }}
                >
                  {channel.name || "Channel"}
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
              </View>
            </View>

            <PressableScale
              className="h-11 flex-row items-center justify-center gap-2 rounded-lg border"
              style={{ borderColor: colors.border }}
              onPress={() => {
                // Only on the way in. A confirming tap when something is
                // removed reads as though the removal failed.
                if (!favorited) {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                }
                toggleFavorite.mutate({
                  channelKey: channel.key,
                  favorited,
                })
                onClose()
              }}
            >
              <Star
                size={16}
                // Filled amber rather than the button's own colour, as on the
                // web: a fill in the text colour is easy to miss.
                color={favorited ? "#f59e0b" : colors.foreground}
                fill={favorited ? "#f59e0b" : "transparent"}
              />
              <Text className="text-foreground text-sm font-medium">
                {favorited ? "Remove from favorites" : "Add to favorites"}
              </Text>
            </PressableScale>

            {signedIn ? (
              <PressableScale
                className="mt-2 h-11 flex-row items-center justify-center gap-2 rounded-lg border"
                style={{ borderColor: colors.border }}
                onPress={() => onEditGroups(channel)}
              >
                {grouped ? (
                  <FolderHeart size={16} color={iconPrimary} />
                ) : (
                  <FolderPlus size={16} color={colors.foreground} />
                )}
                <Text className="text-foreground text-sm font-medium">
                  {grouped ? "Edit groups" : "Add to groups"}
                </Text>
              </PressableScale>
            ) : null}
          </>
        ) : null}
      </View>
    </Sheet>
  )
})
