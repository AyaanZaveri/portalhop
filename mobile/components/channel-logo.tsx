import { View } from "react-native"
import { Image } from "expo-image"
import { Tv } from "lucide-react-native"

import { useTheme } from "@/lib/theme"
import { useLogoStyle, type LogoStyle } from "@/lib/logo-style"

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
 * The inset, wider than it is tall.
 *
 * Equal padding makes wide marks tower over square ones. A wide mark is fitted
 * by its width and a square one by its height, so the two are sized by
 * different edges of the same box — CP24 filled the tile corner to corner while
 * Game Show Network sat in the middle of it at half the area. Taking the extra
 * room off the sides is what evens them up: it shrinks exactly the marks that
 * are fitted by width and leaves room for the ones fitted by height.
 */
const PAD_X = 11
const PAD_Y = 6

/** How far past its natural fit a logo may be scaled to fill the box. */
const MAX_SCALE = 1.8

/**
 * The tile's corner, and the corner of the box holding the artwork.
 *
 * The tile matches the row it sits in, which is rounded-xl.
 *
 * The inner corner is what softens a logo that fills its own canvas. Artwork
 * like Sony SAB or Game Show Network is a hard-edged rectangle, and set against
 * a rounded tile it reads as a photograph pinned to a card rather than as part
 * of it. Rounding the box it is clipped to rounds the artwork with it.
 *
 * It costs nothing on every other kind of logo, which is why no rule is needed
 * to decide who gets it. A mark on transparency has nothing in its corners to
 * lose, and where the tile continues the artwork's own background — Mississauga,
 * CityNews — the corners it gives up are repainted in the very same colour by
 * the tile behind. Only artwork that reaches its own edge in a colour of its own
 * can tell the difference, and that is exactly the artwork this is for.
 *
 * INNER is OUTER minus the vertical padding, which is the usual way to keep two
 * corners concentric. It cannot be exact here because the padding differs by
 * axis, and the vertical is the one the eye follows on a tile this shape.
 */
const OUTER_RADIUS = 12
const INNER_RADIUS = OUTER_RADIUS - PAD_Y

/**
 * The tile when a logo offers no colour of its own.
 *
 * Colouring this from the logo unconditionally was tried at length and
 * abandoned. A logo is usually a coloured mark on transparency, so any colour
 * drawn from it is a colour the mark itself contains — and putting the two
 * together is how a mark disappears. It is only safe once the mark has been
 * redrawn white, which is what the native pass decides.
 */
const TILE_BASE = "#18181b"

/**
 * Where to draw the image so its artwork fills the box.
 *
 * expo-image can only fit the whole image, margin included, so the layout is
 * done here: the image is placed at whatever size puts its artwork against the
 * edges of the box, and the surplus hangs outside and is clipped. There is
 * nothing to lose to that clipping — the surplus is the logo's own margin,
 * which is transparent, or the flat colour the tile is already painted.
 */
function layout(style: LogoStyle, boxWidth: number, boxHeight: number) {
  const { aspect, content } = style
  if (!aspect || !content || content.width <= 0 || content.height <= 0) {
    return null
  }

  // What the image would be at its natural fit, which is the ceiling the scale
  // limit is measured against.
  const fitted = Math.min(boxWidth, boxHeight * aspect)

  const width = Math.min(
    Math.min(boxWidth / content.width, (boxHeight / content.height) * aspect),
    fitted * MAX_SCALE,
  )
  const height = width / aspect

  return {
    width,
    height,
    // Centred on the artwork rather than on the image, or a logo whose margin
    // is lopsided — StarPlus carries all of its on one side — would sit off to
    // one side of the tile.
    left: boxWidth / 2 - width * (content.x + content.width / 2),
    top: boxHeight / 2 - height * (content.y + content.height / 2),
  }
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
   * A redrawn copy of the logo where one exists, and the original otherwise.
   *
   * The redraw turns the mark white and punches its holes through in the tile
   * colour, so the tile can be the channel's own colour without the mark
   * disappearing into it — which is what happened every time the tile was
   * coloured from the logo without touching the logo itself.
   *
   * Whether a logo can take that is decided natively, by measuring it. Anything
   * that cannot — several hues, or artwork that is already a tile — comes back
   * untouched and is drawn exactly as it is.
   */
  const style = useLogoStyle(uri)

  const boxWidth = CHANNEL_LOGO_WIDTH - PAD_X * 2
  const boxHeight = CHANNEL_LOGO_HEIGHT - PAD_Y * 2
  const placement = layout(style, boxWidth, boxHeight)

  return (
    <View
      className="items-center justify-center overflow-hidden border"
      style={{
        width: CHANNEL_LOGO_WIDTH,
        height: CHANNEL_LOGO_HEIGHT,
        borderRadius: OUTER_RADIUS,
        borderColor: colors.border,
        backgroundColor: style.color ?? TILE_BASE,
      }}
    >
      {uri ? (
        // The box is its own view so the overhang is clipped to it rather than
        // to the tile, which would let a scaled-up logo run under the border.
        <View
          style={{
            width: boxWidth,
            height: boxHeight,
            overflow: "hidden",
            borderRadius: INNER_RADIUS,
          }}
        >
          <Image
            source={{ uri: style.uri ?? uri }}
            // No radius of its own: the box it is clipped to carries it. Put
            // here it would round the image rather than what is on screen — the
            // image is usually larger than the box and its corners are already
            // outside it, so the corner that shows is the box's either way.
            style={
              placement
                ? { position: "absolute", ...placement }
                : { width: "100%", height: "100%" }
            }
            contentFit="contain"
            // The image is deliberately drawn larger than the view it sits in
            // -- that is how the artwork fills the box while its margin hangs
            // outside -- and downscaling decodes to the view instead, so the
            // part on screen is the part that was thrown away. It showed as
            // logos soft in the list and sharp on the player, which is the same
            // tile: the list recycles, so a bitmap decoded for one row's layout
            // was reused at another's.
            allowDownscaling={false}
            recyclingKey={recyclingKey}
            // Rows are recycled, and a cross-fade on a recycled row reads as a
            // glitch rather than as loading.
            transition={0}
          />
        </View>
      ) : (
        <Tv size={18} color={colors["muted-foreground"]} />
      )}
    </View>
  )
}
