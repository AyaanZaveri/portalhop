import { View } from "react-native"
import { Image } from "expo-image"
import { Tv } from "lucide-react-native"

import { useTheme } from "@/lib/theme"
import { useLogoColor } from "@/lib/logo-colors"

/**
 * The logo tile, in the one shape every screen shows it.
 *
 * Wider than tall, at 3:2. Channel logos are mostly wordmarks — "SPORTSNET",
 * "Cable Pulse 24" — and a square tile makes those tiny, because contentFit
 * contain has to shrink a wide mark until its width fits. Widening the tile
 * without shortening it costs nothing: square marks still get their full 44
 * points of height and simply centre, while wide ones get half again as much
 * room. Going wider still, to 16:9, starts taking width from the channel name
 * and leaves square marks floating in a lot of empty tile.
 */
export const CHANNEL_LOGO_HEIGHT = 44
export const CHANNEL_LOGO_WIDTH = 66

export function ChannelLogo({
  uri,
  recyclingKey,
}: {
  uri: string | undefined
  /** Ties the cached image to the channel, so a recycled row does not show the last one. */
  recyclingKey?: string
}) {
  const { colors } = useTheme()

  /**
   * The tile takes the logo's own colour.
   *
   * Most channel logos are a mark with no background of their own, so they were
   * sitting on the same near-black square as every other channel and a list of
   * them read as identical. Colouring the tile is what makes a row recognisable
   * before the name is read — and it is the tile rather than the whole row,
   * because the row carries text that a saturated wash would fight with.
   *
   * Full strength, not a wash: the logo is drawn over it with padding, so this
   * is the mark's own backdrop rather than a tint over content.
   */
  const tint = useLogoColor(uri)

  return (
    <View
      className="items-center justify-center overflow-hidden border"
      style={{
        width: CHANNEL_LOGO_WIDTH,
        height: CHANNEL_LOGO_HEIGHT,
        padding: 5,
        borderRadius: 10,
        borderColor: colors.border,
        backgroundColor: tint ?? "#18181b",
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          // Radius on the image as well as the parent: Android does not
          // reliably clip a child to a rounded parent, so relying on
          // overflow-hidden alone leaves square corners on the logo.
          style={{ width: "100%", height: "100%", borderRadius: 6 }}
          contentFit="contain"
          recyclingKey={recyclingKey}
          // Rows are recycled, and a cross-fade on a recycled row reads as a
          // glitch rather than as loading.
          transition={0}
        />
      ) : (
        <Tv size={18} color={colors["muted-foreground"]} />
      )}
    </View>
  )
}
