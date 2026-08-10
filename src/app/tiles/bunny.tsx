"use client"

import { GemSmoke } from "@paper-design/shaders-react"
import { Suspense } from "react"

/**
 * The app's own mark, drawn as a mask for the shader.
 *
 * Lucide's rabbit, the same one the channel list wears in its header, written
 * out as an SVG rather than imported as a component: the shader takes an image
 * and reads its alpha, so the mark has to be something that can be rasterised
 * rather than a React element.
 *
 * Stroked a good deal heavier than the icon is normally drawn. The shader
 * solves a distance field inside the mask and fills it, so a stroke is a
 * corridor for the smoke to run down, and at the icon's own weight there is
 * nothing to run down: the corridor closes and the mark reads as a flat
 * outline with a haze around it.
 */
const RABBIT = [
  "M13 16a3 3 0 0 1 2.24 5",
  "M18 12h.01",
  "M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3",
  "M20 8.54V4a2 2 0 1 0-4 0v3",
  "M7.612 12.524a3 3 0 1 0-1.6 4.3",
]

const MASK =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${RABBIT.map(
      (d) => `<path d="${d}"/>`,
    ).join("")}</svg>`,
  )

/**
 * The mark, as smoke through a gem.
 *
 * Every colour is a step of one lime ramp, and the darkest of them is a mid
 * lime. That is the whole reason this ignores the page's theme entirely. The
 * metal it replaced was a lit material, so half of it was shadow, and the only
 * way to keep the shadow off the page was to blend the canvas into it: screen
 * against a dark page to drop the black, multiply against a light one to drop
 * the white. Which meant the mark had to know the theme, and it changed a frame
 * behind the page, and you could see the frame.
 *
 * Nothing here is ever dark, so nothing has to be subtracted, so there is no
 * blend mode, no theme, and nothing to lag. The background is transparent
 * rather than a colour, which the shader supports directly: it premultiplies
 * colorBack by its own alpha, so at zero it contributes nothing and the smoke
 * composites straight onto the page.
 */
function Mark({ size }: { size: number }) {
  return (
    <span className="t-bunny-mark">
      <GemSmoke
        width={size}
        height={size}
        image={MASK}
        // Hold the component back until the mask has been turned into a field,
        // rather than mounting on a transparent pixel and running the shader
        // over nothing. See Bunny below for why.
        suspendWhenProcessingImage
        colors={["#5ca300", "#99e600", "#f7fee7"]}
        // Transparent, where the playground this was tuned in used black. There
        // the canvas is the whole page; here it is a 96-pixel square in a header
        // that turns white in light mode, and an opaque background would be a
        // black tile sitting behind the mark. The shader premultiplies colorBack
        // by its own alpha, so at zero it contributes nothing and the rest of
        // the settings carry over untouched.
        colorBack="#00000000"
        colorInner="#7dd100"
        innerDistortion={1}
        outerDistortion={0.8}
        outerGlow={0}
        innerGlow={1}
        offset={0}
        angle={0}
        size={0.8}
        speed={0.5}
        scale={0.78}
      />
    </span>
  )
}

/**
 * The mark, held back until it has something to draw.
 *
 * The blink is not the shader warming up. GemSmoke does not use the mask
 * directly: it solves a field inside it first, and until that resolves it
 * mounts with a single transparent pixel standing in for the image. So the
 * canvas spends that time animating an empty field, and the rabbit arrives all
 * at once when the solve lands. What you see is not a slow start, it is the
 * shader running correctly on nothing.
 *
 * suspendWhenProcessingImage makes the component wait for the solve instead,
 * which turns two states into one. The boundary is here rather than up the page
 * so a header ornament can never suspend anything else, and the fallback holds
 * the square so the heading does not jump when the mark lands in it. The fade
 * is CSS on the mark itself, which only mounts once there is something to fade.
 */
export function Bunny({ size = 96 }: { size?: number }) {
  return (
    <div
      className="t-bunny"
      role="img"
      aria-label="Portal Hop"
      style={{ width: size, height: size }}
    >
      <Suspense fallback={null}>
        <Mark size={size} />
      </Suspense>
    </div>
  )
}
