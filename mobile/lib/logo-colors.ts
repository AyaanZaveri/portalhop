import { useEffect, useState } from "react"
import { getColors } from "react-native-image-colors"

import { db } from "./db"

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

/**
 * Picks the colour a channel would be recognised by.
 *
 * Vibrant before dominant on Android: a logo is usually a mark on white or
 * transparent, so the dominant colour is often the backdrop rather than the
 * brand. Vibrant is the one that reads as "the BBC red" or "the ZDF orange".
 */
function pickColor(result: Awaited<ReturnType<typeof getColors>>) {
  if (result.platform === "android") {
    return result.vibrant || result.dominant || null
  }
  if (result.platform === "ios") {
    return result.primary || result.background || null
  }
  return result.vibrant || result.dominant || null
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
  // Read synchronously when it is already known, so a recycled row paints its
  // tint on the first frame rather than flashing untinted and correcting.
  const [color, setColor] = useState<string | null>(() =>
    url ? (memory.get(url) ?? null) : null,
  )

  useEffect(() => {
    if (!url) {
      setColor(null)
      return
    }

    if (memory.has(url)) {
      setColor(memory.get(url) ?? null)
      return
    }

    let cancelled = false
    const task = inFlight.get(url) ?? resolve(url).finally(() => inFlight.delete(url))
    inFlight.set(url, task)

    void task.then((found) => {
      if (!cancelled) setColor(found)
    })

    return () => {
      cancelled = true
    }
  }, [url])

  return color
}
