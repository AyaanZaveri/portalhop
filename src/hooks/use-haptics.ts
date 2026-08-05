"use client"

import { useCallback } from "react"
import { useWebHaptics } from "web-haptics/react"

import { isMobileApp } from "@/lib/build-target"

// The web Vibration API is a no-op inside the Android WebView — it needs the
// VIBRATE permission, which only arrives with @capacitor/haptics, and even then
// the native plugin gives a far better-tuned tap than a raw vibration. So the
// packaged app routes through Capacitor and the web build keeps using
// web-haptics exactly as before.
export type HapticStrength = "light" | "medium"

// Durations chosen to match what the web build already used at each site.
const webPatterns: Record<
  HapticStrength,
  { pattern: { duration: number }[]; intensity: number }
> = {
  light: { pattern: [{ duration: 10 }], intensity: 0.3 },
  medium: { pattern: [{ duration: 15 }], intensity: 0.4 },
}

export function useHaptics() {
  const { trigger: triggerWebHaptic } = useWebHaptics()

  const triggerWebFallback = useCallback(
    (strength: HapticStrength) => {
      const { pattern, intensity } = webPatterns[strength]
      void triggerWebHaptic(pattern, { intensity })
    },
    [triggerWebHaptic],
  )

  return useCallback(
    (strength: HapticStrength = "light") => {
      if (!isMobileApp) {
        triggerWebFallback(strength)
        return
      }

      void (async () => {
        const { Capacitor } = await import("@capacitor/core")
        // The mobile bundle can still be opened in a browser during debugging.
        if (!Capacitor.isNativePlatform()) {
          triggerWebFallback(strength)
          return
        }

        const { Haptics, ImpactStyle } = await import("@capacitor/haptics")
        // impact() rather than selectionChanged(): the latter only guarantees
        // feedback once selectionStart() has opened a selection, which doesn't
        // map onto these one-shot interactions.
        await Haptics.impact({
          style: strength === "medium" ? ImpactStyle.Medium : ImpactStyle.Light,
        })
      })().catch(() => {
        // A device without a vibrator rejects; nothing to recover from.
      })
    },
    [triggerWebFallback],
  )
}
