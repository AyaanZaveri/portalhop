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

    void (async () => {
      const { Capacitor } = await import("@capacitor/core")
      if (cancelled || !Capacitor.isNativePlatform()) return

      const { SplashScreen } = await import("@capacitor/splash-screen")
      await SplashScreen.hide()
    })()

    return () => {
      cancelled = true
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
