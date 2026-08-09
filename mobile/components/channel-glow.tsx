import { useWindowDimensions, View } from "react-native"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"

import { useTheme } from "@/lib/theme"

/**
 * A wash of the channel's own colour, falling from the top of its page.
 *
 * Drawn with react-native-svg rather than a gradient package, for two reasons.
 * It is already a dependency, so this needs no new native build to appear —
 * expo-linear-gradient is a native module and would have meant rebuilding to
 * see a visual change. And it draws a real radial falloff: a linear fade is
 * even across the full width, which reads as a band of colour rather than as
 * light coming from somewhere.
 *
 * React Native's own experimental_backgroundImage takes CSS radial-gradient()
 * and would be one style prop instead of this file, but it is marked
 * experimental with a warning against shipping it, so it is worth revisiting
 * once that lands properly rather than adopting now.
 */

/** How far down the page the light reaches. */
const HEIGHT = 260

/**
 * The strongest the wash gets, at its centre.
 *
 * Low on purpose, and lower again in light mode. On the near-black background
 * a colour at this alpha reads as light; on a white one the same wash reads as
 * dirt, because darkening a light surface looks like a smudge rather than a
 * glow.
 */
const PEAK_DARK = 0.3
const PEAK_LIGHT = 0.16

/**
 * Above this the colour is too pale to wash anything.
 *
 * Logos that get the paper tile report a near-white colour — it is the tile
 * they need, not an identity — and spreading that across the top of a dark page
 * is a grey haze, while on a light page it is invisible. Better to show
 * nothing.
 */
const TOO_PALE = 0.82

function luminance(hex: string) {
  const value = hex.replace("#", "")
  if (value.length !== 6) return 0
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  // Perceived rather than plain average: the eye takes most of its brightness
  // from green, so an average calls a saturated blue as light as a yellow.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function ChannelGlow({ color }: { color: string | undefined }) {
  const { width } = useWindowDimensions()
  const { isDark } = useTheme()

  if (!color || luminance(color) > TOO_PALE) return null

  const peak = isDark ? PEAK_DARK : PEAK_LIGHT

  return (
    // Behind everything and deaf to touches: the header's back button sits over
    // this, and a view laid across the top of the screen would otherwise
    // swallow the tap.
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: HEIGHT,
      }}
    >
      <Svg width={width} height={HEIGHT}>
        <Defs>
          {/* Centred on the top edge rather than inside the box, so what shows
              is the lower half of the falloff — light arriving from off-screen
              rather than a disc sitting on the page. Wider than it is tall so
              it spreads across the header instead of pooling in the middle. */}
          <RadialGradient id="glow" cx="50%" cy="0%" rx="75%" ry="100%">
            <Stop offset="0" stopColor={color} stopOpacity={peak} />
            {/* A middle stop, because two stops band visibly on Android at
                these alphas. SVG has no dither to fall back on, so the ramp
                has to be gentle enough not to need one. */}
            <Stop offset="0.45" stopColor={color} stopOpacity={peak * 0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={HEIGHT} fill="url(#glow)" />
      </Svg>
    </View>
  )
}
