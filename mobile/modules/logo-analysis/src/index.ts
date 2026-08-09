import { requireOptionalNativeModule } from "expo"

/**
 * How a channel's logo should be presented.
 *
 * This is the contract the two native halves both implement — Kotlin under
 * ../android, Swift under ../ios — and it lives here rather than beside the
 * caller so there is one place to change when the shape changes, and one place
 * to read to know what a platform has to return.
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

/**
 * The native side, or null where there is none.
 *
 * Optional on purpose. Every platform this app runs on has an implementation
 * now, but a JS-only context — a web build, a test — should degrade to leaving
 * every logo as drawn rather than throwing at import.
 *
 * `kind` is still returned by both platforms and is not read: the fields say
 * everything. It is stripped before a verdict is stored.
 */
export const LogoAnalysis = requireOptionalNativeModule<{
  prepare: (url: string) => Promise<(LogoStyle & { kind: string }) | null>
}>("LogoAnalysis")
