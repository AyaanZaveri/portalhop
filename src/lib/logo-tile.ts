import { createHash } from "node:crypto"

import sharp from "sharp"

import {
  analyse,
  TILE_BASE,
  type LogoStyle,
} from "@/lib/logo-analysis/algorithm"

// M3U clients tend to present channel art in a widescreen slot. Make the
// exported PNG itself fill that slot so it never inherits the app's compact,
// rounded row-tile shape.
const WIDTH = 320
const HEIGHT = 180
const PAD_X = 0
const PAD_Y = 0
const BOX_WIDTH = WIDTH
const BOX_HEIGHT = HEIGHT
const MAX_SCALE = 1.8
const ANALYSIS_TARGET = 512

/**
 * A cache key for the rendered presentation, rather than the channel identity.
 * Bumping the version invalidates every previously cached rendering cleanly.
 */
export function logoTileKey(logoUrl: string) {
  return createHash("sha256")
    .update(`portalhop-logo-tile-v2:${logoUrl}`)
    .digest("base64url")
    .slice(0, 24)
}

export async function renderLogoTile(input: Buffer, logoUrl: string) {
  const decoded = await sharp(input, { limitInputPixels: 16_000_000 })
    .rotate()
    .resize({
      width: ANALYSIS_TARGET,
      height: ANALYSIS_TARGET,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (!decoded.info.width || !decoded.info.height) {
    throw new Error("Logo has no dimensions")
  }

  // The app's analysis is deliberately platform-neutral: it only needs RGBA
  // bytes, width, and height. Sharp gives us precisely that on the server.
  const pixels = new Uint8ClampedArray(
    decoded.data.buffer,
    decoded.data.byteOffset,
    decoded.data.byteLength,
  )
  const verdict = analyse(
    {
      data: pixels,
      width: decoded.info.width,
      height: decoded.info.height,
    } as ImageData,
    logoUrl,
  )
  const artwork = await sharp(Buffer.from(pixels), {
    raw: {
      width: decoded.info.width,
      height: decoded.info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer()

  const placement = layout(verdict.style)
  const mark = artwork.toString("base64")
  const artworkSvg = Buffer.from(
    `<svg width="${BOX_WIDTH}" height="${BOX_HEIGHT}" viewBox="0 0 ${BOX_WIDTH} ${BOX_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,${mark}" x="${placement.left}" y="${placement.top}" width="${placement.width}" height="${placement.height}" preserveAspectRatio="none"/></svg>`,
  )
  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: verdict.style.color ?? TILE_BASE,
    },
  })
    .composite([{ input: artworkSvg, left: PAD_X, top: PAD_Y }])
    .png()
    .toBuffer()
}

function layout(style: LogoStyle) {
  const { aspect, content } = style
  if (!aspect || !content || content.width <= 0 || content.height <= 0) {
    return { width: BOX_WIDTH, height: BOX_HEIGHT, left: 0, top: 0 }
  }

  const fitted = Math.min(BOX_WIDTH, BOX_HEIGHT * aspect)
  const width = Math.min(
    Math.min(BOX_WIDTH / content.width, (BOX_HEIGHT / content.height) * aspect),
    fitted * MAX_SCALE,
  )
  return {
    width,
    height: width / aspect,
    left: BOX_WIDTH / 2 - width * (content.x + content.width / 2),
    top: BOX_HEIGHT / 2 - (width / aspect) * (content.y + content.height / 2),
  }
}
