import { useEffect, useState } from "react"
import { requireOptionalNativeModule } from "expo"

import { db } from "./db"

/**
 * How a channel's logo should be presented.
 *
 * Every field is optional and every one is independent, because the answers are
 * independent: a logo can be redrawn without offering a colour, offer a colour
 * without being redrawn, and report its shape either way. An empty object is
 * the honest description of "draw it as it came", so there is no separate kind
 * for it.
 */
export type LogoStyle = {
  /** A redrawn copy to draw instead of the original, where one was made. */
  uri?: string
  /** The colour the tile should take, where the logo offers one. */
  color?: string
  /** The image's own width over its height, needed to lay the artwork out. */
  aspect?: number
  /**
   * Where the artwork sits inside the image, in fractions of it.
   *
   * Logo files carry wildly different amounts of their own margin, and fitting
   * the image rather than the artwork passes that straight through: Mississauga
   * is 30% flat blue above and below its mark and came out a postage stamp,
   * while CP24 is drawn edge to edge and came out enormous. Given the
   * rectangle, the tile can size the artwork instead and the two agree.
   */
  content?: { x: number; y: number; width: number; height: number }
}

const native = requireOptionalNativeModule<{
  prepare: (url: string) => Promise<(LogoStyle & { kind: string }) | null>
}>("LogoAnalysis")

const PLAIN: LogoStyle = {}

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

  let style: LogoStyle
  try {
    // The native side still labels its verdicts, but nothing here reads the
    // label any more — the fields say everything — and storing it would put a
    // dead key in every row.
    const { kind, ...prepared } = (await native!.prepare(url)) ?? {}
    void kind
    style = prepared
  } catch {
    // A failure is not a verdict. This used to fall through to "plain" and then
    // store it, so one timed-out request marked a logo plain for good — which is
    // how two identical logos at different URLs ended up looking different, one
    // redrawn and one not, with no way back short of clearing the table.
    //
    // Nothing is written and nothing is remembered, so the next row to ask for
    // this logo tries again.
    return PLAIN
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
