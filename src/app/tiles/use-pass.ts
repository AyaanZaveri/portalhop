"use client"

import { useEffect, useState } from "react"

import { analyse, TARGET, type LogoStyle, type Trace } from "@/lib/logo-analysis/algorithm"

export type Pass = {
  state: "loading" | "ready" | "failed"
  /** The logo as it came, for the left-hand side of every comparison. */
  before?: string
  /** The redrawn copy, where the pass made one. */
  after?: string
  style?: LogoStyle
  trace?: Trace
  /** Debug renders, drawn from the trace rather than described. */
  classes?: string
  /** Every non-transparent pixel painted white, which is the obvious approach. */
  flattened?: string
  enclosedMap?: string
  ring?: string
  /**
   * How long the pass itself took, in milliseconds.
   *
   * The pass, and nothing around it. Not the fetch, which is the network; not
   * the yields this file inserts to keep the page painting; not the four debug
   * renders below, which cost more than the analysis and exist only for this
   * page. Timing any of those would make the number a measure of the demo
   * rather than of the algorithm, and it is on screen next to a claim that the
   * work happened here.
   */
  ms?: number
}

const cache = new Map<string, Pass>()
const listeners = new Map<string, Set<() => void>>()

function draw(width: number, height: number, paint: (image: ImageData) => void) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return undefined
  const image = context.createImageData(width, height)
  paint(image)
  context.putImageData(image, 0, 0)
  return canvas.toDataURL("image/png")
}

/**
 * Hands the frame back to the browser before carrying on.
 *
 * The pass itself is synchronous, and there are a dozen of them on one page, so
 * without this they land back to back on the main thread and hold it for the
 * better part of a second. Nothing repaints while that is going on, which is
 * why the loading state was invisible rather than merely brief: the orb is a
 * canvas driven by requestAnimationFrame and the shimmer is an animated
 * gradient, and neither of them gets a frame to run in. Resolving from a task
 * scheduled inside the frame callback, rather than from the callback itself,
 * puts the continuation after the paint instead of just before it.
 */
const paint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0))
  })

async function run(url: string): Promise<Pass> {
  try {
    // The CORS options are for logo hosts, and only they should get them. A
    // file the reader dropped in arrives as a blob: URL, which is same-origin
    // and has no headers to negotiate, so it is fetched plainly rather than
    // asked to satisfy a cross-origin handshake it is not part of.
    const remote = /^https?:/i.test(url)
    const response = await fetch(
      url,
      remote ? { mode: "cors", credentials: "omit" } : undefined,
    )
    if (!response.ok) return { state: "failed" }

    await paint()

    const bitmap = await createImageBitmap(await response.blob())
    const longest = Math.max(bitmap.width, bitmap.height)
    const scale = longest > TARGET ? TARGET / longest : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return { state: "failed" }
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const image = context.getImageData(0, 0, width, height)
    // Kept before analyse(), which redraws in place. The ring figure below is
    // drawn from this rather than read back off the canvas, which by then holds
    // the redrawn pixels.
    const original = new Uint8ClampedArray(image.data)
    const trace = {} as Trace
    const started = performance.now()
    const verdict = analyse(image, url, trace)
    const ms = performance.now() - started

    let after: string | undefined
    if (verdict.redrawn) {
      context.putImageData(verdict.redrawn, 0, 0)
      after = canvas.toDataURL("image/png")
    }

    const count = width * height

    // The four renders below are four full PNG encodes, which cost more than
    // the analysis they illustrate. They are also nobody's critical path: the
    // tile is already decided by here.
    await paint()

    // What the pass sees before it decides anything: ink, paper, nothing.
    const classes = trace.kind
      ? draw(width, height, (out) => {
          for (let i = 0; i < count; i++) {
            const p = i * 4
            const k = trace.kind[i]
            if (k === 0) continue
            const v = k === 1 ? 255 : 96
            out.data[p] = v
            out.data[p + 1] = v
            out.data[p + 2] = v
            out.data[p + 3] = 255
          }
        })
      : undefined

    // The obvious approach, so the page can show what is wrong with it: paint
    // everything that is not transparent white, and watch the holes fill in.
    const flattened = trace.kind
      ? draw(width, height, (out) => {
          for (let i = 0; i < count; i++) {
            if (trace.kind[i] === 0) continue
            const p = i * 4
            out.data[p] = 255
            out.data[p + 1] = 255
            out.data[p + 2] = 255
            out.data[p + 3] = 255
          }
        })
      : undefined

    // Which light regions turned out to be holes rather than background.
    const enclosedMap = trace.enclosed
      ? draw(width, height, (out) => {
          for (let i = 0; i < count; i++) {
            const p = i * 4
            const k = trace.kind[i]
            if (k === 0) continue
            if (trace.enclosed[i]) {
              out.data[p] = 0x9a
              out.data[p + 1] = 0xe6
              out.data[p + 2] = 0x00
              out.data[p + 3] = 255
            } else {
              const v = k === 1 ? 70 : 34
              out.data[p] = v
              out.data[p + 1] = v
              out.data[p + 2] = v
              out.data[p + 3] = 255
            }
          }
        })
      : undefined

    // The band the border rule samples, lit up on the artwork.
    //
    // Drawn thicker than the two pixels it actually reads, and thicker in
    // proportion on a larger canvas, so that two logos stored at different
    // sizes show a band of the same visual weight once they are fitted into
    // the same box. At a true two pixels a 512-wide logo shows a hairline and a
    // 96-wide one shows a stripe.
    const band = Math.max(2, Math.round(Math.max(width, height) / 80))
    const ring = draw(width, height, (out) => {
      const src = original
      const onRing = (x: number, y: number) =>
        x < band || y < band || x >= width - band || y >= height - band
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const p = (y * width + x) * 4
          if (onRing(x, y)) {
            out.data[p] = 0x9a
            out.data[p + 1] = 0xe6
            out.data[p + 2] = 0x00
            out.data[p + 3] = 255
          } else {
            out.data[p] = src[p] * 0.45
            out.data[p + 1] = src[p + 1] * 0.45
            out.data[p + 2] = src[p + 2] * 0.45
            out.data[p + 3] = src[p + 3]
          }
        }
      }
    })

    return {
      state: "ready",
      before: url,
      after,
      ms,
      style: verdict.style,
      trace,
      classes,
      flattened,
      enclosedMap,
      ring,
    }
  } catch {
    return { state: "failed" }
  }
}

/**
 * Runs the real pass, in the browser, on the logo given.
 *
 * On the main thread on purpose: the app puts this in a worker because a list
 * of thousands would otherwise land in the middle of a scroll, and here it is a
 * dozen logos analysed once. Keeping it direct means every number on the page
 * comes back from the same function the app ships.
 */
export function usePass(url: string): Pass {
  const [, force] = useState(0)
  const known = cache.get(url)

  useEffect(() => {
    const notify = () => force((n) => n + 1)
    let set = listeners.get(url)
    if (!set) {
      set = new Set()
      listeners.set(url, set)
    }
    set.add(notify)

    if (!cache.has(url)) {
      cache.set(url, { state: "loading" })
      void run(url).then((result) => {
        cache.set(url, result)
        listeners.get(url)?.forEach((fn) => fn())
      })
    }

    return () => {
      set?.delete(notify)
    }
  }, [url])

  return known ?? { state: "loading" }
}
