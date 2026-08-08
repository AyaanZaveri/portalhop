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

/** What a tile is when there is no colour for it, and the floor every tile is mixed down to. */
const TILE_BASE = "#18181b"

/**
 * How much of the channel's colour survives the mix.
 *
 * The one number worth tuning here. Higher is more colourful and more likely to
 * swallow part of a logo; lower is safer and duller.
 */
const TILE_MIX = 0.38

/**
 * Mixes a colour down onto the base tile.
 *
 * A logo with more than one colour will clash with any single background — the
 * C-SPAN mark is a red "2" beside white lettering, so a tile light enough for
 * the red is wrong for the white and vice versa. There is no swatch that solves
 * that, because the problem is not which colour, it is how light.
 *
 * So the hue is kept and the lightness is not negotiable: every tile is mixed
 * most of the way down to the same near-black. Marks stay light-on-dark, which
 * is the case logos are drawn for, while the tile still says which channel it
 * is. The ceiling is fixed here rather than left to whatever lightness a
 * palette swatch happened to have.
 */
function mixOverBase(hex: string) {
  const parse = (value: string, at: number) =>
    parseInt(value.slice(at, at + 2), 16)

  const clean = hex.replace("#", "")
  if (clean.length < 6) return TILE_BASE

  const base = TILE_BASE.replace("#", "")
  const channel = (at: number) =>
    Math.round(parse(clean, at) * TILE_MIX + parse(base, at) * (1 - TILE_MIX))
      .toString(16)
      .padStart(2, "0")

  return `#${channel(0)}${channel(2)}${channel(4)}`
}

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
   * The stored value is the channel's hue; mixOverBase decides how much of it
   * reaches the tile. Blending at render rather than at extraction means that
   * balance can be changed without re-decoding every logo in the cache.
   */
  const tint = useLogoColor(uri)

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
        backgroundColor: tint ? mixOverBase(tint) : TILE_BASE,
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
