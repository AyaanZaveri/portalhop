"use client"

import { cn } from "@/lib/utils"
import { TILE_BASE, useLogoStyle, type LogoStyle } from "@/lib/logo-analysis"

/**
 * The same tile the mobile app draws, number for number.
 *
 * Every figure below is the one in mobile/components/channel-logo.tsx, and the
 * reasoning for each lives there — why the tile is 3:2 rather than square, why
 * the inset is wider than it is tall, why the corner is a notch tighter than
 * the row it sits in. A channel should look like itself on either platform, and
 * two sets of numbers drifting apart is how that stops being true.
 */
const WIDTH = 66
const HEIGHT = 44
const PAD_X = 11
const PAD_Y = 6
const OUTER_RADIUS = 10
const MAX_SCALE = 1.8

const BOX_WIDTH = WIDTH - PAD_X * 2
const BOX_HEIGHT = HEIGHT - PAD_Y * 2

/**
 * Where to draw the image so its artwork fills the box.
 *
 * The same arithmetic the mobile tile does, and for the same reason: object-fit
 * can only fit the whole image, margin included. Logo files carry wildly
 * different amounts of their own — Mississauga is 30% flat blue above and below
 * its mark, CP24 is drawn edge to edge — so fitting the image rather than the
 * artwork hands that straight through and one comes out a postage stamp beside
 * the other.
 */
function layout(style: LogoStyle) {
  const { aspect, content } = style
  if (!aspect || !content || content.width <= 0 || content.height <= 0) return null

  const fitted = Math.min(BOX_WIDTH, BOX_HEIGHT * aspect)
  const width = Math.min(
    Math.min(BOX_WIDTH / content.width, (BOX_HEIGHT / content.height) * aspect),
    fitted * MAX_SCALE,
  )
  const height = width / aspect

  return {
    width,
    height,
    // Centred on the artwork rather than on the image, or a logo whose margin
    // is lopsided — StarPlus carries all of its on one side — sits off centre.
    left: BOX_WIDTH / 2 - width * (content.x + content.width / 2),
    top: BOX_HEIGHT / 2 - height * (content.y + content.height / 2),
  }
}

/**
 * The channel logo, on a tile of the channel's own colour.
 *
 * The colour, and the redrawn copy where there is one, come from the same pass
 * the Android and iOS apps run — see src/lib/logo-analysis. The mark is turned
 * white and its enclosed holes punched through in the tile colour, so the tile
 * can be the channel's colour without the mark disappearing into it.
 */
export function ChannelLogo({
  url,
  className,
}: {
  url: string | undefined
  className?: string
}) {
  const style = useLogoStyle(url)
  const placement = layout(style)

  return (
    <div
      className={cn(
        "border-border/60 relative shrink-0 overflow-clip border",
        className,
      )}
      style={{
        width: WIDTH,
        height: HEIGHT,
        borderRadius: OUTER_RADIUS,
        backgroundColor: style.color ?? TILE_BASE,
      }}
    >
      {url ? (
        // The box is its own element so the overhang is clipped to it rather
        // than to the tile, which would let a scaled-up logo run under the
        // border.
        <div
          className="absolute overflow-clip"
          style={{
            left: PAD_X,
            top: PAD_Y,
            width: BOX_WIDTH,
            height: BOX_HEIGHT,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Portal and EPG logos come from arbitrary hosts. */}
          <img
            src={style.uri ?? url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute max-w-none object-contain"
            style={
              placement ?? {
                width: BOX_WIDTH,
                height: BOX_HEIGHT,
                left: 0,
                top: 0,
              }
            }
          />
        </div>
      ) : null}
    </div>
  )
}
