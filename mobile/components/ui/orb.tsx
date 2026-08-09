import { ThinkingOrb, type OrbState } from "expo-thinking-orbs"

import { useTheme } from "@/lib/theme"

/**
 * The app's loading indicator.
 *
 * One component so the colour and the state are decided once. Every place that
 * waits should look like the same app waiting, and an orb that is lime in one
 * place and default in another reads as two different loaders.
 *
 * The orb draws through Skia on the UI thread, so it keeps animating while the
 * JavaScript thread is busy — which is exactly what a loader is for, since the
 * work it is covering is what would otherwise stall a JS-driven spinner.
 */
export function Orb({
  size = 64,
  state = "working",
}: {
  /**
   * The library tunes its dot layout for two sizes, 64 and 20, and interpolates
   * between them. Staying at or near those two is what keeps the dots from
   * going sparse.
   */
  size?: number
  state?: OrbState
}) {
  const { colors, isDark } = useTheme()

  return (
    <ThinkingOrb
      state={state}
      size={size}
      color={colors.primary}
      // Told rather than sniffed. `auto` reads the system scheme, which is not
      // the app's — the theme here is a stored preference and can disagree with
      // the device.
      theme={isDark ? "dark" : "light"}
      accessibilityLabel="Loading"
    />
  )
}
