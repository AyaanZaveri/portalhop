import { useCallback } from "react"
import { useColorScheme } from "nativewind"

import { darkTokens, lightTokens } from "@portalhop/shared/theme/tokens"

import { saveThemePreference } from "./preferences"

/**
 * The active palette, plus a toggle.
 *
 * Reads NativeWind's scheme rather than React Native's so a manual override
 * reaches both the `dark:` classes and these raw values — a good deal of React
 * Native takes colours as props (lucide icons, BottomSheet backgrounds,
 * placeholder text) where a className cannot reach.
 */
export function useTheme() {
  const { colorScheme, setColorScheme } = useColorScheme()
  const isDark = colorScheme === "dark"

  const toggle = useCallback(() => {
    const next = isDark ? "light" : "dark"
    setColorScheme(next)
    void saveThemePreference(next)
  }, [isDark, setColorScheme])

  return { isDark, colors: isDark ? darkTokens : lightTokens, toggle }
}
