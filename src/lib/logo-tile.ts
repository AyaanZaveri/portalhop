import { createHash } from "node:crypto"

import sharp from "sharp"

import {
  analyse,
  TILE_BASE,
  type LogoStyle,
} from "@/lib/logo-analysis/algorithm"

// M3U clients tend to present channel art in a widescreen slot. Keep the
// existing artwork box exactly the same size as PortalHop's row tile, while
// making only its outer canvas almost 16:9. A modest radius helps the clients
// which show artwork without applying their own rounded treatment.
const SCALE = 4
const WIDTH = 66 * SCALE
const HEIGHT = 148
const PAD_X = 11 * SCALE
const PAD_Y = 10
const BOX_WIDTH = WIDTH - PAD_X * 2
const BOX_HEIGHT = HEIGHT - PAD_Y * 2
const RADIUS = 4 * SCALE
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
  const roundedMask = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect width="${WIDTH}" height="${HEIGHT}" rx="${RADIUS}" fill="white"/></svg>`,
  )

  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: verdict.style.color ?? TILE_BASE,
    },
  })
    .composite([
      { input: artworkSvg, left: PAD_X, top: PAD_Y },
      { input: roundedMask, blend: "dest-in" },
    ])
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
