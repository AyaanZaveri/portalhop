"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

import { isMobileApp } from "@/lib/build-target"

// Native-only chrome for the packaged Android app. `isMobileApp` is a build-time
// constant, so on the web build this whole component compiles down to an effect
// that returns immediately and Capacitor never enters the bundle.
export function NativeAppShell() {
  const { resolvedTheme } = useTheme()

  // Dismiss the splash once React has painted, rather than letting Capacitor
  // auto-hide it on a timer — that would flash an empty webview if the shell
  // takes longer than the timer, or hold the splash after it's already ready.
  useEffect(() => {
    if (!isMobileApp) return

    let cancelled = false
    let frame = 0

    /**
     * Resolves once the safe-area insets have actually landed.
     *
     * Capacitor applies window insets after the document is ready: until then
     * the webview is padded by the system bars and env() reports zero, and
     * afterwards it draws edge to edge with the real values. The layout moves
     * at that moment — everything above the fold slides — so the splash has to
     * outlast it rather than reveal it.
     *
     * The value is measured off a probe element instead of read from the
     * custom property, because a custom property's computed value can come
     * back as the unresolved env() expression rather than a length.
     */
    function waitForInsets() {
      return new Promise<void>((resolve) => {
        const probe = document.createElement("div")
        probe.style.cssText =
          "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)"
        document.body.appendChild(probe)

        // Plenty of devices have no top inset at all and will never report one,
        // so this can't wait indefinitely for a value that isn't coming.
        const deadline = performance.now() + 500

        const check = () => {
          if (cancelled) {
            probe.remove()
            resolve()
            return
          }

          const settled =
            probe.getBoundingClientRect().height > 0 ||
            performance.now() > deadline

          if (!settled) {
            frame = requestAnimationFrame(check)
            return
          }

          probe.remove()
          // One more frame so the layout that consumes the inset has painted
          // before the splash comes down.
          frame = requestAnimationFrame(() => resolve())
        }

        frame = requestAnimationFrame(check)
      })
    }

    void (async () => {
      const { Capacitor } = await import("@capacitor/core")
      if (cancelled || !Capacitor.isNativePlatform()) return

      const { SplashScreen } = await import("@capacitor/splash-screen")

      // launchAutoHide is off, so nothing else will take the splash down. The
      // wait must never be able to strand the app behind it.
      try {
        await waitForInsets()
      } finally {
        if (!cancelled) await SplashScreen.hide()
      }
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [])

  // Android 15+ draws the app under the status and navigation bars with no way
  // to opt out, so the bar icons sit directly on the app's own background and
  // have to be re-tinted whenever the theme changes or they become unreadable.
  useEffect(() => {
    if (!isMobileApp || !resolvedTheme) return

    let cancelled = false

    void (async () => {
      const { Capacitor, SystemBars, SystemBarsStyle } = await import(
        "@capacitor/core"
      )
      if (cancelled || !Capacitor.isNativePlatform()) return

      // "Dark" means light icons for a dark background, and vice versa.
      await SystemBars.setStyle({
        style:
          resolvedTheme === "dark"
            ? SystemBarsStyle.Dark
            : SystemBarsStyle.Light,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [resolvedTheme])

  return null
}
