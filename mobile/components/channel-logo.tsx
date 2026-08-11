import { useState } from "react"
import { View } from "react-native"
import { Image } from "expo-image"
import { Tv } from "lucide-react-native"

import { useTheme } from "@/lib/theme"
import {
  forgetLogoStyle,
  useLogoStyle,
  type LogoStyle,
} from "@/lib/logo-style"

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
 * A notch tighter than the row it sits in, which is rounded-xl. Matching it
 * exactly was tried and the tile read soft against artwork that is mostly
 * straight edges and right angles -- a logo is a rectangle of its own, and the
 * corner should agree with the artwork more than with the container.
 *
 * Artwork that fills its own canvas — Sony SAB, Game Show Network — keeps its
 * hard corners, and two attempts at softening them are the reason.
 *
 * On the box it did nothing. A logo is fitted by whichever edge runs out first,
 * and for artwork that shape it is the height, so it stands four to six points
 * clear either side and the radius bit only into empty tile. The one box edge
 * it did reach was the flush top and bottom, which is a straight edge — so it
 * read as a slice taken off rather than a corner turned.
 *
 * On the image it worked, and broke the opposite case. A wordmark on
 * transparency is content-tight, so CP24 and HBO are drawn 44 wide in a 44-wide
 * box and their letters reach the frame; rounding the frame cut into the ink.
 *
 * Neither element is right for both, and nothing here can choose between them:
 * a filled rectangle and a wordmark on transparency both come back plain, with
 * no colour, no redrawn copy and content filling the canvas. Telling them apart
 * needs the native pass to say which it saw — a field in the payload, in Kotlin
 * and Swift, behind a schema bump and a build — and that is a lot of machinery
 * for a corner that has to be small enough not to be noticed anyway.
 *
 * It costs nothing on every other kind of logo, which is why no rule is needed
 * to decide who gets it. A mark on transparency has nothing in its corners to
 * lose, and where the tile continues the artwork's own background — Mississauga,
 * CityNews — the corners it gives up are repainted in the very same colour by
 * the tile behind. Only artwork that reaches its own edge in a colour of its own
 * can tell the difference, and that is exactly the artwork this is for.
 *
 */
const OUTER_RADIUS = 10

/**
 * The tile when a logo offers no colour of its own.
 *
 * An olive, taken from the primary's own hue at almost no saturation. It was
 * zinc-900, which carries three points of blue the rest of the palette does not
 * — the theme's neutrals are Tailwind neutral, which is flat — so the tile read
 * cool against everything around it. Tailwind has no olive to reach for and
 * Radix's is two points of green, which is not visible at this lightness; taken
 * from the lime instead, it is six, which is.
 *
 * Colouring this from the logo unconditionally was tried at length and
 * abandoned. A logo is usually a coloured mark on transparency, so any colour
 * drawn from it is a colour the mark itself contains — and putting the two
 * together is how a mark disappears. It is only safe once the mark has been
 * redrawn white, which is what the native pass decides.
 *
 * Fixed rather than taken from the palette, and dark in both themes. That looks
 * like an oversight and is the opposite: no colour is exactly what the native
 * pass returns when the ink is light. A colourless mark that is dark gets
 * whitened, and a dark wordmark beside colour gets the paper tile, so what is
 * left here is overwhelmingly white artwork — CP24, HBO, NFL Network. On muted
 * those are barely there in light mode, and on card they are gone.
 *
 * It is also not free to move. A whitened mark has this exact value painted
 * into its holes, so they read as cutouts rather than as grey blocks; changing
 * it means changing TILE_BASE in the Kotlin and the Swift together and
 * discarding every image already written against the old one.
 */
const TILE_BASE = "#181a14"

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

  /**
   * The redrawn copy is gone, so draw the logo it was made from.
   *
   * It lives in the OS cache directory and can be reclaimed at any time, while
   * the verdict naming it is durable — so a row can be told to draw a file that
   * no longer exists, and an Image pointed at a missing file draws nothing.
   * That is the tile with a colour on it and no mark, which is what this is
   * here to prevent: the original is still a logo, and a logo is what the row
   * needs.
   *
   * Forgetting the verdict is the other half. The next row to ask for this logo
   * finds nothing stored, analyses it again, and writes a new file — so the
   * redraw comes back on its own rather than staying broken until the table is
   * cleared by hand.
   */
  const [redrawnMissing, setRedrawnMissing] = useState(false)
  const [seenUri, setSeenUri] = useState(uri)

  // A recycled row is handed a new channel while mounted, and the last one's
  // failure says nothing about this one.
  if (uri !== seenUri) {
    setSeenUri(uri)
    setRedrawnMissing(false)
  }

  const redrawn = redrawnMissing ? undefined : style.uri
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
          style={{ width: boxWidth, height: boxHeight, overflow: "hidden" }}
        >
          <Image
            source={{ uri: redrawn ?? uri }}
            onError={() => {
              // Only the redraw is worth retrying. A provider's own URL that
              // fails is a broken link, and forgetting a verdict over it would
              // re-analyse the same dead URL on every pass.
              if (!redrawn) return
              setRedrawnMissing(true)
              void forgetLogoStyle(uri)
            }}
            // No radius: see the note by OUTER_RADIUS. Here it clips the ink of
            // a wordmark that reaches its own frame, and on the box it reaches
            // nothing.
            style={
              placement && redrawn
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
