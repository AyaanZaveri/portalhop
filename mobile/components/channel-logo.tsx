import { View } from "react-native"
import { Image } from "expo-image"
import { Tv } from "lucide-react-native"

import { useTheme } from "@/lib/theme"

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

/**
 * One tile colour for every channel.
 *
 * Colouring this from the logo was tried at length and abandoned. A logo is
 * usually a coloured mark on transparency, so any colour drawn from it is a
 * colour the mark itself contains — and putting the two together is how a mark
 * disappears. The cases that worked were the ones whose artwork already carried
 * a background, and there is no way to tell those apart from what the palette
 * exposes. The channel's colour now lives on the progress bar, where nothing
 * sits on top of it and no such conflict exists.
 */
const TILE_BASE = "#18181b"

export function ChannelLogo({
  uri,
  recyclingKey,
}: {
  uri: string | undefined
  /** Ties the cached image to the channel, so a recycled row does not show the last one. */
  recyclingKey?: string
}) {
  const { colors } = useTheme()

  return (
    <View
      className="items-center justify-center overflow-hidden border"
      style={{
        width: CHANNEL_LOGO_WIDTH,
        height: CHANNEL_LOGO_HEIGHT,
        // Enough that a logo drawn edge to edge in its own file — CP24's is —
        // does not touch the tile, and so does not tower over one that carries
        // its own margin, like TSN's.
        padding: 8,
        borderRadius: 10,
        borderColor: colors.border,
        backgroundColor: TILE_BASE,
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
