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
export function useTheme() {
  const { theme } = useUniwind()
  const isDark = theme === "dark"

  const toggle = useCallback(() => {
    const next = isDark ? "light" : "dark"
    Uniwind.setTheme(next)
    void saveThemePreference(next)
  }, [isDark])

  return { isDark, colors: isDark ? darkTokens : lightTokens, toggle }
}
