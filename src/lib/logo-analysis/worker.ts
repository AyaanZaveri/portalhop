/// <reference lib="webworker" />

import { analyse, TARGET, type LogoStyle } from "./algorithm"

export type Request = { id: number; url: string }
export type Response =
  | { id: number; ok: true; style: LogoStyle; redrawn?: Blob }
  | { id: number; ok: false }

/**
 * Decodes a logo into pixels a canvas will hand back.
 *
 * Fetched rather than loaded through an Image element, because a fetch either
 * succeeds under CORS or fails loudly — where an image tags the canvas as
 * tainted and only tells you about it later, when getImageData throws. Logos
 * come from arbitrary hosts and go through wsrv.nl, which answers with
 * access-control-allow-origin: *, so the bytes are legally readable.
 *
 * Scaled on the way in, to the same longest edge the native passes use.
 */
async function decode(url: string) {
  const response = await fetch(url, { mode: "cors", credentials: "omit" })
  if (!response.ok) return null

  const source = await createImageBitmap(await response.blob())
  const longest = Math.max(source.width, source.height)
  const scale = longest > TARGET ? TARGET / longest : 1
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  const canvas = new OffscreenCanvas(width, height)
  // willReadFrequently, because getImageData is the only reason this canvas
  // exists — it asks the browser for a readback-friendly surface rather than
  // one optimised for compositing.
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    source.close()
    return null
  }

  context.drawImage(source, 0, 0, width, height)
  source.close()
  return { canvas, image: context.getImageData(0, 0, width, height) }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, url } = event.data
  try {
    const decoded = await decode(url)
    if (!decoded) {
      ;(self as unknown as Worker).postMessage({ id, ok: false } satisfies Response)
      return
    }

    const verdict = analyse(decoded.image, url)
    if (!verdict.redrawn) {
      ;(self as unknown as Worker).postMessage({
        id,
        ok: true,
        style: verdict.style,
      } satisfies Response)
      return
    }

    // The redraw changed the pixels in place, so they go back onto the canvas
    // they came from and out as a PNG — lossless, because the mark is flat
    // white on a flat tile and JPEG would put ringing on every edge of it.
    const context = decoded.canvas.getContext("2d")
    context?.putImageData(verdict.redrawn, 0, 0)
    const redrawn = await decoded.canvas.convertToBlob({ type: "image/png" })

    ;(self as unknown as Worker).postMessage({
      id,
      ok: true,
      style: verdict.style,
      redrawn,
    } satisfies Response)
  } catch {
    // A failure is not a verdict. Reported as such so the caller stores
    // nothing, and the next row to ask for this logo tries again.
    ;(self as unknown as Worker).postMessage({ id, ok: false } satisfies Response)
  }
}
