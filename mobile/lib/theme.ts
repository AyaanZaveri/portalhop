import { useCallback } from "react"
import { Uniwind, useUniwind } from "uniwind"

import { darkTokens, lightTokens } from "@portalhop/shared/theme/tokens"

import { saveThemePreference } from "./preferences"

/**
 * The active scheme, its palette, and a toggle.
 *
 * `className` handles most colouring, and Uniwind resolves oklch there so the
 * palette keeps its full gamut. These resolved values exist for the places a
 * class cannot reach — lucide's `color`, BottomSheet's background, placeholder
 * text — where React Native needs a plain colour it can parse.
 */
/**
 * What CSS `filter: brightness(f)` does — multiply each sRGB channel.
 *
 * React Native has no filters, so the web's `brightness-75 dark:brightness-90`
 * on accent icons has to be computed rather than declared. Derived from the
 * palette rather than hardcoded, so it follows if the primary ever changes.
 */
function scaleBrightness(hex: string, factor: number) {
  const channels = [1, 3, 5].map((i) =>
    Math.round(Math.min(255, parseInt(hex.slice(i, i + 2), 16) * factor))
      .toString(16)
      .padStart(2, "0"),
  )
  return `#${channels.join("")}`
}

export function useTheme() {
  const { theme } = useUniwind()
  const isDark = theme === "dark"
  const colors = isDark ? darkTokens : lightTokens

  const toggle = useCallback(() => {
    const next = isDark ? "light" : "dark"
    Uniwind.setTheme(next)
    void saveThemePreference(next)
  }, [isDark])

  return {
    isDark,
    colors,
    /**
     * The primary, knocked back in light mode so accent icons read as accents
     * rather than competing with the label. Dark mode takes the colour as it
     * is: the primary is a light lime, and on a near-black background it needs
     * its full value to hold up.
     */
    iconPrimary: isDark
      ? colors.primary
      : scaleBrightness(colors.primary, 0.75),
    /**
     * The primary again, pushed brighter for the orb in dark mode.
     *
     * The palette's lime is already fully saturated in sRGB — the generator
     * clipped it getting there, since the real token is more chromatic than
     * sRGB can hold — so there is no saturation left to add and value is the
     * only thing that can make it read. At its stored value it sits at 40%
     * lightness, which on a near-black screen is a dim ring of dots rather
     * than a loader.
     *
     * Light mode keeps the icons' knock-back: on white, brighter is less
     * visible, not more.
     */
    orbPrimary: isDark
      ? scaleBrightness(colors.primary, 1.2)
      : scaleBrightness(colors.primary, 0.75),
    toggle,
  }
}
