/**
 * The third implementation of the logo pass, after the Kotlin and the Swift.
 *
 * The thresholds below are the same numbers in the same order as
 * mobile/modules/logo-analysis/android/.../LogoAnalysisModule.kt, and the
 * reasoning for each lives there, next to the logos that produced it, rather
 * than being copied into three files and left to drift apart.
 *
 * This one is the easiest of the three: a browser hands over straight RGBA
 * bytes, non-premultiplied, so there is none of the unpicking iOS needs. What
 * it does need is a canvas the pixels can legally be read out of — see
 * decode() in ./worker, and the note there about CORS.
 */

/** How a channel's logo should be presented. Mirrors LogoStyle on mobile. */
export type LogoStyle = {
  /** A redrawn copy to draw instead of the original, where one was made. */
  uri?: string
  /** The colour the tile should take, where the logo offers one. */
  color?: string
  /** The image's own width over its height, needed to lay the artwork out. */
  aspect?: number
  /** Where the artwork sits inside the image, in fractions of it. */
  content?: { x: number; y: number; width: number; height: number }
}

/**
 * Everything the pass measured on the way to its verdict.
 *
 * Filled only when a caller asks for it, and read by nothing in the app — it
 * exists so /tiles can show the real numbers rather than describing them, which
 * is the difference between a page that explains the algorithm and a page that
 * claims to.
 */
export type Trace = {
  width: number
  height: number
  /** Share of the canvas that is transparent. Below 0.12 the artwork is a tile. */
  transparent: number
  /** How far the coloured pixels spread around the hue circle. Above 0.25, several hues. */
  hueSpread: number
  /** Share of opaque pixels carrying a usable hue. */
  colorful: number
  /** Share of opaque pixels with no hue, and how much of that is dark. */
  achromatic: number
  achromaticDark: number
  /** The dominant edge colour and how much of the ring agrees with it. */
  border: { color: string; share: number } | null
  /** The most saturated pixel, and the tile it became. */
  accent: string | null
  tile: string | null
  /** White against the accent, before and after darkening. */
  contrastBefore: number | null
  contrastAfter: number | null
  /** Which branch decided it. */
  route: "border" | "paper" | "whitened" | "redraw" | "plain"
  /** Per pixel: 0 clear, 1 mark, 2 light. */
  kind: Uint8Array
  /** Per pixel: 1 where a light region was found enclosed and repainted. */
  enclosed: Uint8Array
}

/** What the pass decides, before a redrawn copy has been turned into a URL. */
export type Verdict = {
  style: LogoStyle
  /** Set when the mark was redrawn and the caller must write the pixels out. */
  redrawn?: ImageData
}

export const TARGET = 512

const CLEAR = 0
const MARK = 1
const LIGHT = 2

const OPAQUE_BELOW = 0.12
const MULTI_HUE_ABOVE = 0.25
const NEEDS_COLOR_ABOVE = 0.04
const SURROUNDED_ABOVE = 0.55
const WHITE_CONTRAST_MIN = 3.0
const BORDER_MAJORITY_ABOVE = 0.6
const BORDER_TOLERANCE = 28
const BORDER_BUCKET = 24
const WORDMARK_SHARE_ABOVE = 0.15
const WORDMARK_DARK_ABOVE = 0.4
const DARK_INK_ABOVE = 0.35
const DARK_INK_LIGHTNESS = 0.45

const TILE_PAPER = "#fafafa"
/** Kept in step with TILE_BASE in the app's own logo tile. */
const TILE_BASE = "#181a14"

type Rgb = { r: number; g: number; b: number }

/** Android's ColorUtils.colorToHSL, with hue in degrees. */
function toHsl({ r, g, b }: Rgb) {
  const rf = r / 255
  const gf = g / 255
  const bf = b / 255
  const max = Math.max(rf, gf, bf)
  const min = Math.min(rf, gf, bf)
  const delta = max - min
  const l = (max + min) / 2

  let h = 0
  let s = 0
  if (delta !== 0) {
    if (max === rf) h = ((gf - bf) / delta) % 6
    else if (max === gf) h = (bf - rf) / delta + 2
    else h = (rf - gf) / delta + 4
    // Safe from a divide by zero: delta is non-zero only when 0 < l < 1.
    s = delta / (1 - Math.abs(2 * l - 1))
  }

  h = (h * 60) % 360
  if (h < 0) h += 360
  return { h, s, l }
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const m = l - c / 2
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))

  let r = 0
  let g = 0
  let b = 0
  switch (Math.floor(h / 60) % 6) {
    case 0: [r, g, b] = [c, x, 0]; break
    case 1: [r, g, b] = [x, c, 0]; break
    case 2: [r, g, b] = [0, c, x]; break
    case 3: [r, g, b] = [0, x, c]; break
    case 4: [r, g, b] = [x, 0, c]; break
    default: [r, g, b] = [c, 0, x]
  }

  const byte = (v: number) => Math.min(255, Math.max(0, Math.round((v + m) * 255)))
  return { r: byte(r), g: byte(g), b: byte(b) }
}

/** WCAG relative luminance: linearised channels, weighted for the eye. */
function relativeLuminance({ r, g, b }: Rgb) {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** How far white stands off a colour. White's own luminance is 1.0. */
function whiteContrast(rgb: Rgb) {
  return 1.05 / (relativeLuminance(rgb) + 0.05)
}

/** The lightest a colour may be while a white mark still reads on it. */
function darken(rgb: Rgb): Rgb {
  if (whiteContrast(rgb) >= WHITE_CONTRAST_MIN) return rgb

  const { h, s, l } = toHsl(rgb)
  let low = 0
  let high = l
  // Halved rather than solved: luminance runs through a gamma curve and a
  // weighted sum, so there is no lightness to rearrange for.
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2
    if (whiteContrast(fromHsl(h, s, middle)) >= WHITE_CONTRAST_MIN) low = middle
    else high = middle
  }
  return fromHsl(h, s, low)
}

function hex({ r, g, b }: Rgb) {
  const pair = (v: number) => v.toString(16).padStart(2, "0")
  return `#${pair(r)}${pair(g)}${pair(b)}`
}

function distance(a: Rgb, b: Rgb) {
  return Math.max(
    Math.abs(a.r - b.r),
    Math.abs(a.g - b.g),
    Math.abs(a.b - b.b),
  )
}

/**
 * The colour the outer ring is mostly made of, when one colour holds it.
 *
 * Bucketed rather than averaged: a wordmark running out to the edge puts a few
 * of its own pixels in the sample, and an average moves to a colour that is
 * nowhere on the edge at all.
 */
function dominantBorder(data: Uint8ClampedArray, width: number, height: number) {
  const ring: Rgb[] = []
  const push = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const i = (y * width + x) * 4
    if (data[i + 3] > 200) ring.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  for (let x = 0; x < width; x++) {
    for (const y of [0, 1, height - 2, height - 1]) push(x, y)
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, 1, width - 2, width - 1]) push(x, y)
  }
  if (ring.length === 0) return null

  const bucket = ({ r, g, b }: Rgb) =>
    ((r / BORDER_BUCKET) | 0) * 65536 +
    ((g / BORDER_BUCKET) | 0) * 256 +
    ((b / BORDER_BUCKET) | 0)

  const counts = new Map<number, number>()
  for (const c of ring) counts.set(bucket(c), (counts.get(bucket(c)) ?? 0) + 1)

  let heaviest = 0
  let best = -1
  for (const [key, count] of counts) {
    if (count > best) {
      best = count
      heaviest = key
    }
  }

  let r = 0
  let g = 0
  let b = 0
  let members = 0
  for (const c of ring) {
    if (bucket(c) !== heaviest) continue
    r += c.r
    g += c.g
    b += c.b
    members++
  }
  if (members === 0) return null

  const dominant = {
    r: Math.round(r / members),
    g: Math.round(g / members),
    b: Math.round(b / members),
  }

  const share = ring.filter((c) => distance(c, dominant) < BORDER_TOLERANCE).length / ring.length
  return { rgb: dominant, share }
}

/**
 * Where the artwork sits inside its canvas, as fractions of it.
 *
 * The background to ignore is transparency for most logos and the flat border
 * colour for filled artwork, which has no transparency to ignore.
 */
function frame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  background: Rgb | null,
): Pick<LogoStyle, "aspect" | "content"> {
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const alpha = data[i + 3]
      const ink = background
        ? alpha > 128 &&
          distance(
            { r: data[i], g: data[i + 1], b: data[i + 2] },
            background,
          ) >= BORDER_TOLERANCE
        : alpha >= 128
      if (!ink) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  const aspect = width / height
  // Nothing found means nothing to frame — a fully transparent image, or filled
  // artwork that is a single flat colour edge to edge.
  if (right < left || bottom < top) return { aspect }

  return {
    aspect,
    content: {
      x: left / width,
      y: top / height,
      width: (right - left + 1) / width,
      height: (bottom - top + 1) / height,
    },
  }
}

/**
 * Paints every light region that is mostly ringed by the mark.
 *
 * Four-way neighbours throughout: a one-pixel diagonal gap, which anti-aliasing
 * produces constantly, would otherwise join a hole to the outside and halve its
 * measured surroundedness.
 */
function recolorEnclosed(
  data: Uint8ClampedArray,
  kind: Uint8Array,
  width: number,
  height: number,
  accent: Rgb,
  enclosed?: Uint8Array,
) {
  const seen = new Uint8Array(kind.length)
  const queue = new Int32Array(kind.length)
  const region: number[] = []

  for (let start = 0; start < kind.length; start++) {
    if (kind[start] !== LIGHT || seen[start]) continue

    region.length = 0
    let head = 0
    let tail = 0
    queue[tail++] = start
    seen[start] = 1

    let touchingMark = 0
    let touchingRest = 0

    while (head < tail) {
      const i = queue[head++]
      region.push(i)
      const x = i % width
      const y = (i / width) | 0

      for (let n = 0; n < 4; n++) {
        const nx = x + (n === 0 ? -1 : n === 1 ? 1 : 0)
        const ny = y + (n === 2 ? -1 : n === 3 ? 1 : 0)

        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          // The image edge counts as the outside, so a region running off it is
          // not enclosed by anything.
          touchingRest++
          continue
        }

        const j = ny * width + nx
        if (kind[j] === LIGHT) {
          if (!seen[j]) {
            seen[j] = 1
            queue[tail++] = j
          }
        } else if (kind[j] === MARK) touchingMark++
        else touchingRest++
      }
    }

    const border = touchingMark + touchingRest
    if (border === 0) continue
    if (touchingMark / border < SURROUNDED_ABOVE) continue

    for (const i of region) {
      const p = i * 4
      data[p] = accent.r
      data[p + 1] = accent.g
      data[p + 2] = accent.b
      if (enclosed) enclosed[i] = 1
    }
  }
}

export function analyse(image: ImageData, url: string, trace?: Partial<Trace>): Verdict {
  const { width, height } = image
  const data = image.data
  const count = width * height

  const kind = new Uint8Array(count)
  let transparent = 0
  let opaque = 0

  // Hues are angles and average as vectors. Summed as numbers, red at 0.02 and
  // red at 0.98 would average to cyan rather than back to red.
  let hueX = 0
  let hueY = 0
  let hueCount = 0
  let bestSaturation = 0
  let accent: Rgb | null = null

  // Uncoloured ink, split by lightness. This is the wordmark next to a coloured
  // mark, and whether it is dark decides which way up the tile goes.
  let achromatic = 0
  let achromaticDark = 0

  for (let i = 0; i < count; i++) {
    const p = i * 4
    if (data[p + 3] < 128) {
      transparent++
      kind[i] = CLEAR
      continue
    }
    opaque++

    const rgb = { r: data[p], g: data[p + 1], b: data[p + 2] }
    const { h, s, l } = toHsl(rgb)
    const colored = s > 0.25 && l > 0.12 && l < 0.95
    kind[i] = colored || l < 0.5 ? MARK : LIGHT

    if (colored) {
      const radians = (h * Math.PI) / 180
      hueX += Math.cos(radians)
      hueY += Math.sin(radians)
      hueCount++
      if (s > bestSaturation) {
        bestSaturation = s
        accent = rgb
      }
    } else {
      achromatic++
      if (l < DARK_INK_LIGHTNESS) achromaticDark++
    }
  }

  const transparentFraction = transparent / count
  const hueSpread =
    hueCount < 20
      ? 0
      : 1 - Math.hypot(hueX / hueCount, hueY / hueCount)
  const colorfulFraction = opaque === 0 ? 0 : hueCount / opaque

  if (trace) {
    trace.width = width
    trace.height = height
    trace.transparent = transparentFraction
    trace.hueSpread = hueSpread
    trace.colorful = colorfulFraction
    trace.achromatic = opaque === 0 ? 0 : achromatic / opaque
    trace.achromaticDark = achromatic === 0 ? 0 : achromaticDark / achromatic
    trace.accent = accent ? hex(accent) : null
    trace.contrastBefore = accent ? whiteContrast(accent) : null
    trace.kind = kind
    trace.border = null
    trace.tile = null
    trace.contrastAfter = null
  }

  const plain = (background: Rgb | null = null): Verdict => ({
    style: frame(data, width, height, background),
  })

  // Artwork that fills its own canvas is already a tile. Nothing is redrawn,
  // but where its edge is a flat colour the tile can continue it, so the two
  // read as one shape instead of a square sitting inside a box.
  if (transparentFraction < OPAQUE_BELOW) {
    const found = dominantBorder(data, width, height)
    if (trace && found) trace.border = { color: hex(found.rgb), share: found.share }
    const border = found && found.share >= BORDER_MAJORITY_ABOVE ? found.rgb : null
    if (!border) {
      if (trace) trace.route = "plain"
      return plain()
    }
    if (trace) {
      trace.route = "border"
      trace.tile = hex(border)
    }
    return {
      style: {
        uri: url,
        color: hex(border),
        ...frame(data, width, height, border),
      },
    }
  }

  if (hueSpread > MULTI_HUE_ABOVE) {
    // Several hues, so the mark keeps its colours -- but if the lettering
    // beside them is dark, the tile has to be light or the name cannot be read.
    // The image itself is untouched, so no copy is written.
    const hasWordmark = opaque > 0 && achromatic / opaque >= WORDMARK_SHARE_ABOVE
    const darkWordmark =
      achromatic > 0 && achromaticDark / achromatic >= WORDMARK_DARK_ABOVE
    if (hasWordmark && darkWordmark) {
      if (trace) {
        trace.route = "paper"
        trace.tile = TILE_PAPER
      }
      return {
        style: { color: TILE_PAPER, ...frame(data, width, height, null) },
      }
    }
    if (trace) trace.route = "plain"
    return plain()
  }

  // A mark with no colour in it has no colour to put behind it -- but if the
  // ink is dark it is invisible against the near-black tile, and that is the
  // one case where leaving a logo alone is worse than touching it.
  let tile: Rgb
  let neutral = false
  if (colorfulFraction < NEEDS_COLOR_ABOVE || !accent) {
    let dark = 0
    for (let i = 0; i < count; i++) {
      if (kind[i] === CLEAR) continue
      const p = i * 4
      if (toHsl({ r: data[p], g: data[p + 1], b: data[p + 2] }).l < DARK_INK_LIGHTNESS) {
        dark++
      }
    }
    if (opaque === 0 || dark / opaque < DARK_INK_ABOVE) {
      if (trace) trace.route = "plain"
      return plain()
    }
    tile = { r: 0x18, g: 0x1a, b: 0x14 }
    neutral = true
    if (trace) trace.route = "whitened"
  } else {
    // Darkened before it is used anywhere: the holes are painted with it and
    // the tile is set to it, and both need the white mark to read against them.
    tile = darken(accent)
    if (trace) trace.route = "redraw"
  }

  if (trace) {
    trace.tile = hex(tile)
    trace.contrastAfter = whiteContrast(tile)
    trace.enclosed = new Uint8Array(count)
  }

  recolorEnclosed(data, kind, width, height, tile, trace?.enclosed)

  for (let i = 0; i < count; i++) {
    if (kind[i] !== MARK) continue
    const p = i * 4
    data[p] = 255
    data[p + 1] = 255
    data[p + 2] = 255
  }

  const shape = frame(data, width, height, null)
  // A colourless mark asks for no tile of its own, and saying so lets the tile
  // stay whatever the app's base happens to be under either theme.
  return {
    style: neutral ? shape : { color: hex(tile), ...shape },
    redrawn: image,
  }
}

export { TILE_BASE, TILE_PAPER }
