import { useEffect, useState } from "react"

import { LogoAnalysis, type LogoStyle } from "@/modules/logo-analysis/src"

import { db } from "./db"

export type { LogoStyle }

const PLAIN: LogoStyle = {}

const memory = new Map<string, LogoStyle>()
const inFlight = new Map<string, Promise<LogoStyle>>()

/**
 * Every decision ever made, read in one query at startup.
 *
 * Storing the answers was never the problem — they were already in SQLite and
 * being found. The problem was that each row asked for its own, so a cold
 * launch fired one SELECT per visible logo and every one of them resolved a
 * frame or more after the row had already painted. The list appeared in its
 * fallback colours and then corrected itself a moment later, which read as the
 * app changing its mind rather than as loading.
 *
 * One scan of a small table is cheaper than fifteen indexed lookups and, more
 * to the point, it finishes before the catalogue does — so the first paint has
 * the answers already.
 */
const warm = (async () => {
  try {
    const handle = await db
    const rows = await handle.getAllAsync<{ url: string; style: string }>(
      "SELECT url, style FROM logo_style",
    )
    for (const row of rows) {
      try {
        memory.set(row.url, JSON.parse(row.style) as LogoStyle)
      } catch {
        // One unreadable row is not worth losing the rest of the table over.
      }
    }
  } catch {
    // Falls back to asking per logo, which is what it did before.
  }
})()

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
  // Nothing is decided until the stored answers are in, or a logo already known
  // would be analysed a second time on every launch.
  await warm
  const known = memory.get(url)
  if (known) return known

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
    const { kind, ...prepared } = (await LogoAnalysis!.prepare(url)) ?? {}
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

/**
 * Forgets one verdict, so the next row to want it asks for it again.
 *
 * The redrawn PNG lives in the OS cache directory, which both platforms are
 * free to empty whenever they want the space — and do, arbitrarily and a few
 * files at a time. The verdict naming that file lives in SQLite, which is
 * durable, so the two drift apart: the row says "draw file://…/logo-ab12.png"
 * long after the file has gone, and what draws is nothing at all. That is the
 * tile with a colour and no mark on it.
 *
 * Deliberately not fixed by writing the PNGs somewhere durable. They are
 * derived data, a catalogue holds tens of thousands of them, and the cache
 * directory is exactly the right place for something that can be made again.
 * What was missing is this: noticing they have gone, and making them again.
 */
export async function forgetLogoStyle(url: string) {
  memory.delete(url)
  inFlight.delete(url)

  try {
    const handle = await db
    await handle.runAsync("DELETE FROM logo_style WHERE url = ?", url)
  } catch {
    // The row survives and the redraw is remade on the next launch instead.
    // Dropping it from memory above is what matters for this one.
  }
}

export function useLogoStyle(url: string | undefined): LogoStyle {
  const [style, setStyle] = useState<LogoStyle>(
    () => (LogoAnalysis && url ? memory.get(url) : undefined) ?? PLAIN,
  )
  const [seen, setSeen] = useState(url)

  // Adjusted during render rather than from an effect. A recycled row is handed
  // a new channel while mounted, and syncing that in an effect would show the
  // previous channel's treatment for a frame before correcting it.
  if (url !== seen) {
    setSeen(url)
    setStyle((LogoAnalysis && url ? memory.get(url) : undefined) ?? PLAIN)
  }

  useEffect(() => {
    if (!LogoAnalysis || !url || memory.has(url)) return

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
