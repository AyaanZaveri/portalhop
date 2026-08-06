import { useColorScheme } from "react-native"

import { darkTokens, lightTokens } from "@portalhop/shared/theme/tokens"

/**
 * The active palette as plain values.
 *
 * Needed because a good deal of React Native takes colours as props rather than
 * styles — lucide icons, BottomSheet's background, TextInput's placeholder —
 * and NativeWind's className cannot reach any of those.
 */
export function useTheme() {
  const isDark = useColorScheme() === "dark"
  return { isDark, colors: isDark ? darkTokens : lightTokens }
}
