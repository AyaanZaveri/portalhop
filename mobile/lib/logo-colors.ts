import { useEffect, useState } from "react"
import { requireOptionalNativeModule } from "expo"

import { db } from "./db"

/**
 * Whether the running binary contains the colour extractor.
 *
 * react-native-image-colors calls requireNativeModule at import time, which
 * throws outright when the native side is missing — and JavaScript reaches a
 * development build over the network while native code does not, so an install
 * from before this was added would fail on the import alone rather than simply
 * going without tints. Hence the check before the require, and the require
 * rather than an import.
 */
const available = requireOptionalNativeModule("ImageColors") !== null

type GetColors = typeof import("react-native-image-colors").getColors

const getColors: GetColors | null = available
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("react-native-image-colors").getColors as GetColors)
  : null

/**
 * The colour a channel's logo is known by, for tinting its row.
 *
 * Three layers, because extracting one means downloading and decoding an image
 * and a catalogue here runs to tens of thousands of channels:
 *
 *   in-memory map — answers instantly, and is what a recycled row hits while
 *                   scrolling back over ground it has already covered
 *   SQLite        — survives a restart, so a logo is decoded once ever rather
 *                   than once per launch
 *   extraction    — only for a logo neither layer has seen
 *
 * A null result is cached as deliberately as a colour: it means the logo was
 * looked at and had nothing usable in it, and without recording that it would
 * be retried on every pass.
 */
const memory = new Map<string, string | null>()

/** Logos already being worked on, so ten rows sharing one do not queue ten decodes. */
const inFlight = new Map<string, Promise<string | null>>()

/** Perceived lightness, 0 to 1. */
function luminance(hex: string) {
  const clean = hex.replace("#", "")
  if (clean.length < 6) return 0
  const at = (i: number) => parseInt(clean.slice(i, i + 2), 16)
  return (0.299 * at(0) + 0.587 * at(2) + 0.114 * at(4)) / 255
}

/**
 * Above this, a logo is taken to have a background of its own.
 *
 * Low, because the test is "did anything at all fill this image" rather than
 * "is it bright" — a mark covering a fifth of a transparent canvas still lands
 * well under it.
 */
const OPAQUE_ABOVE = 0.18

/**
 * The tile colour, or null to leave the tile alone.
 *
 * Two kinds of logo, and they want opposite things. One arrives as a finished
 * tile — Mississauga's is a blue square with a white mark on it — and the right
 * move is to continue that colour outwards so the artwork and the tile become
 * one shape. The other is a bare mark on transparency, like TSN's, and there is
 * no background to continue: colouring behind it only risks the tile creeping
 * towards the colour the mark is made of.
 *
 * Telling them apart falls out of how this library computes `average`. It sums
 * red, green and blue over every pixel and never consults alpha, so the
 * transparent parts of a PNG count as black and drag the average down. A
 * floating mark therefore reads very dark; a logo that fills its own canvas
 * does not.
 *
 * A logo with a genuinely dark background — CP24's — reads dark too and is left
 * neutral. That is the right answer by accident and by intent: its own black
 * sits on the near-black tile without a seam either way.
 */
function pickColor(
  result: Awaited<ReturnType<NonNullable<GetColors>>>,
): string | null {
  if (result.platform !== "android") {
    // iOS reports a background swatch directly rather than an average, so there
    // is nothing to infer from; taking it at its word is the closest equivalent.
    return result.platform === "ios" ? result.background || null : null
  }

  if (luminance(result.average) < OPAQUE_ABOVE) return null

  // Dominant rather than vibrant: what is wanted here is the colour the logo
  // is sitting on, which is the most populous one, not the most colourful.
  return result.dominant || null
}

async function readStored(url: string) {
  const handle = await db
  const row = await handle.getFirstAsync<{ color: string | null }>(
    "SELECT color FROM logo_color WHERE url = ?",
    url,
  )
  return row ? { hit: true, color: row.color } : { hit: false, color: null }
}

async function store(url: string, color: string | null) {
  const handle = await db
  await handle.runAsync(
    "INSERT OR REPLACE INTO logo_color (url, color) VALUES (?, ?)",
    url,
    color,
  )
}

async function resolve(url: string): Promise<string | null> {
  const stored = await readStored(url)
  if (stored.hit) {
    memory.set(url, stored.color)
    return stored.color
  }

  let color: string | null = null
  try {
    if (!getColors) return null
    // The library keeps its own cache too; the key keeps it aligned with ours
    // rather than keyed on a URL that may be long.
    color = pickColor(await getColors(url, { cache: true, key: url }))
  } catch {
    // A logo that will not load is not worth an error — the row simply has no
    // tint, which is what it looked like before any of this.
  }

  memory.set(url, color)
  void store(url, color)
  return color
}

/** Null until known, and null forever for a logo with no usable colour. */
export function useLogoColor(url: string | undefined) {
  const cached = available && url ? memory.get(url) : undefined

  // Undefined means "not looked at yet" and null means "looked at, nothing
  // there" — the difference is what stops a logo with no usable colour being
  // re-decoded on every pass.
  const [color, setColor] = useState<string | null | undefined>(cached)
  const [seen, setSeen] = useState(url)

  // Adjusted during render rather than from an effect. A recycled row is handed
  // a new channel while mounted, and syncing that in an effect would paint the
  // previous channel's tint for a frame before correcting it.
  if (url !== seen) {
    setSeen(url)
    setColor(available && url ? memory.get(url) : undefined)
  }

  useEffect(() => {
    // Nothing to do without the extractor, without a logo, or when the answer
    // is already known — and nothing set synchronously here either, so the
    // effect only ever starts work rather than driving a second render.
    if (!available || !url || memory.has(url)) return

    let cancelled = false
    const task =
      inFlight.get(url) ?? resolve(url).finally(() => inFlight.delete(url))
    inFlight.set(url, task)

    void task.then((found) => {
      if (!cancelled) setColor(found)
    })

    return () => {
      cancelled = true
    }
  }, [url])

  return color ?? null
}
