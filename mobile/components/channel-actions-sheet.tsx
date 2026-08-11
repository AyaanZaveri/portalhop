import { forwardRef } from "react"
import { Text, View } from "react-native"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import * as Haptics from "expo-haptics"
import { FolderHeart, FolderPlus, Layers, Star } from "lucide-react-native"

import { favoriteKeyFor, isFavorited, type ChannelWithStreams } from "@/lib/channels"
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
    channel: ChannelWithStreams | null
    favorites: Set<string>
    groups: FavoriteGroup[] | undefined
    signedIn: boolean
    onEditGroups: (channel: ChannelWithStreams) => void
    onChooseSource: (channel: ChannelWithStreams) => void
    onClose: () => void
  }
>(function ChannelActionsSheet(
  { channel, favorites, groups, signedIn, onEditGroups, onChooseSource, onClose },
  ref,
) {
  const { colors, iconPrimary } = useTheme()
  const toggleFavorite = useToggleFavorite()

  // Under either key it might carry, not just this copy's — see isFavorited.
  const has = (key: string) => favorites.has(key)
  const favorited = channel ? isFavorited(channel, has) : false
  const grouped = channel
    ? Boolean(
        groups?.some((group) =>
          isFavorited(channel, (key) => group.channelKeys.includes(key)),
        ),
      )
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
                    className="font-sans text-muted-foreground flex-1 text-xs"
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
                  channelKey: favoriteKeyFor(channel),
                  favorited,
                  // Both, because the channel may have been favourited under
                  // its old per-copy key and removing only the new one would
                  // leave the star lit.
                  alsoRemove: channel.key,
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

            {/* Only where there is a choice to make. A channel carried by one
                portal has nothing to pick between, and a row that opens a list
                of one is a dead end wearing a button. */}
            {channel.streams.length > 1 ? (
              <PressableScale
                className="mt-2 h-11 flex-row items-center justify-center gap-2 rounded-lg border"
                style={{ borderColor: colors.border }}
                onPress={() => onChooseSource(channel)}
              >
                <Layers size={16} color={colors.foreground} />
                <Text className="text-foreground text-sm font-medium">
                  {channel.streams.length} sources
                </Text>
              </PressableScale>
            ) : null}

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
