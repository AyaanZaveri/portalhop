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
     * The primary, knocked back for accent icons so they read as accents
     * rather than competing with the label — the same treatment the category
     * list uses on the web. Light mode needs the heavier reduction.
     */
    iconPrimary: scaleBrightness(colors.primary, isDark ? 0.9 : 0.75),
    toggle,
  }
}
