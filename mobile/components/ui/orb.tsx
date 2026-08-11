import { View } from "react-native"
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
 *
 * Searching, of the six the library offers, because it is the only one that
 * describes what is actually happening: every place this appears, the app is
 * out over the network looking for channels, and a light sweeping the sphere
 * reads as looking. Solving suggests a computation nothing here is doing, and
 * shaping suggests something being built rather than fetched.
 *
 * It also survives being small. A sweep is one continuous motion, so it still
 * reads at the 20pt the pull-to-refresh uses, where shaping's morph and
 * solving's facets need more dots than that size has to give.
 */
export function Orb({
  size = 64,
  state = "searching",
}: {
  /**
   * The library tunes its dot layout for two sizes, 64 and 20, and interpolates
   * between them. Staying at or near those two is what keeps the dots from
   * going sparse.
   */
  size?: number
  state?: OrbState
}) {
  const { orbPrimary, isDark } = useTheme()

  return (
    <ThinkingOrb
      state={state}
      size={size}
      // Its own shade rather than the icons': brighter than the palette's lime
      // in dark mode, where the orb is a scatter of small dots on near-black
      // and the stored value leaves it barely there, and knocked back the way
      // the icons are in light mode, where the same lime at full value goes
      // hazy on white — worse on a loader than on an icon, because a loader is
      // the only thing on the screen to look at.
      color={orbPrimary}
      // Told rather than sniffed. `auto` reads the system scheme, which is not
      // the app's — the theme here is a stored preference and can disagree with
      // the device.
      theme={isDark ? "dark" : "light"}
      accessibilityLabel="Loading"
    />
  )
}

/**
 * A whole screen waiting.
 *
 * Sat dead centre it read as low on the screen, because the eye puts the
 * optical centre above the geometric one and there is nothing below it to
 * balance against. Lifting it by an eighth of the space is the usual
 * correction. It is also smaller than the 64 the library defaults to: at full
 * size, alone on an empty screen with nothing to be in proportion to, it read
 * as the subject rather than as the wait.
 */
export function OrbScreen() {
  return (
    <View className="flex-1 items-center justify-center">
      <View style={{ marginBottom: "12%" }}>
        <Orb size={48} />
      </View>
    </View>
  )
}
