import { useEffect, useState } from "react"
import { requireOptionalNativeModule } from "expo"

import { db } from "./db"

/**
 * How a channel's logo should be presented.
 *
 *   tinted — a single-hue mark on transparency. Flattened to white and set on
 *            the channel's own colour, which is what makes a row unmistakable
 *            at a glance.
 *   plain  — anything else: a mark of several hues that flattening would
 *            destroy, or artwork that already fills its own canvas and is a
 *            finished tile in its own right.
 */
export type LogoStyle = { kind: "tinted"; color: string } | { kind: "plain" }

type Analysis = {
  transparentFraction: number
  hueSpread: number
  colorfulFraction: number
  accent: string | null
  background: string
}

const native = requireOptionalNativeModule<{
  analyze: (url: string) => Promise<Analysis | null>
}>("LogoAnalysis")

/**
 * Below this a logo fills its own canvas, so it is already a tile and wants
 * nothing done to it. Game Show Network measures 0.00; every mark on
 * transparency measured above 0.20.
 */
const OPAQUE_BELOW = 0.12

/**
 * Above this the mark uses more than one hue and has to be left as drawn.
 *
 * The measured gap is wide enough that the exact threshold hardly matters:
 * single-hue marks — TSN, CNN, Food Network, HGTV, C-SPAN — all score 0.00,
 * while the NBC peacock scores 0.88.
 */
const MULTI_HUE_ABOVE = 0.25

/** A mark with almost no coloured pixels has no colour worth putting behind it. */
const NEEDS_COLOR_ABOVE = 0.04

function classify(analysis: Analysis): LogoStyle {
  if (analysis.transparentFraction < OPAQUE_BELOW) return PLAIN
  if (analysis.hueSpread > MULTI_HUE_ABOVE) return PLAIN
  if (analysis.colorfulFraction < NEEDS_COLOR_ABOVE || !analysis.accent) {
    return PLAIN
  }
  return { kind: "tinted", color: analysis.accent }
}

const PLAIN: LogoStyle = { kind: "plain" }

const memory = new Map<string, LogoStyle>()
const inFlight = new Map<string, Promise<LogoStyle>>()

async function readStored(url: string) {
  const handle = await db
  const row = await handle.getFirstAsync<{ style: string }>(
    "SELECT style FROM logo_style WHERE url = ?",
    url,
  )
  if (!row) return null
  try {
    return JSON.parse(row.style) as LogoStyle
  } catch {
    return null
  }
}

async function store(url: string, style: LogoStyle) {
  const handle = await db
  await handle.runAsync(
    "INSERT OR REPLACE INTO logo_style (url, style) VALUES (?, ?)",
    url,
    JSON.stringify(style),
  )
}

/**
 * Analysed once per logo ever.
 *
 * The decoding is quick — a 64px thumbnail off the bitmap Glide already holds
 * from drawing the row — but it is still a native round trip per logo, and a
 * catalogue here runs to tens of thousands. Stored so it happens once: in
 * memory for the rows being scrolled, in SQLite for every launch after the
 * first.
 */
async function resolve(url: string): Promise<LogoStyle> {
  const stored = await readStored(url)
  if (stored) {
    memory.set(url, stored)
    return stored
  }

  let style: LogoStyle = PLAIN
  try {
    const analysis = await native?.analyze(url)
    if (analysis) style = classify(analysis)
  } catch {
    // A logo that will not load or decode stays exactly as it is drawn, which
    // is what it looked like before any of this.
  }

  memory.set(url, style)
  void store(url, style)
  return style
}

export function useLogoStyle(url: string | undefined): LogoStyle {
  const [style, setStyle] = useState<LogoStyle>(
    () => (native && url ? memory.get(url) : undefined) ?? PLAIN,
  )
  const [seen, setSeen] = useState(url)

  // Adjusted during render rather than from an effect. A recycled row is handed
  // a new channel while mounted, and syncing that in an effect would show the
  // previous channel's treatment for a frame before correcting it.
  if (url !== seen) {
    setSeen(url)
    setStyle((native && url ? memory.get(url) : undefined) ?? PLAIN)
  }

  useEffect(() => {
    if (!native || !url || memory.has(url)) return

    let cancelled = false
    const task =
      inFlight.get(url) ?? resolve(url).finally(() => inFlight.delete(url))
    inFlight.set(url, task)

    void task.then((found) => {
      if (!cancelled) setStyle(found)
    })

    return () => {
      cancelled = true
    }
  }, [url])

  return style
}
