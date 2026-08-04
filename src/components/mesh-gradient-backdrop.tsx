"use client"

import { MeshGradient, StaticMeshGradient } from "@paper-design/shaders-react"
import { useTheme } from "next-themes"
import { useHydratedLayout } from "@/hooks/use-hydrated-layout"

export function PrimaryMeshGradientBackdrop() {
  const { resolvedTheme } = useTheme()
  const isHydrated = useHydratedLayout()

  const isDark = resolvedTheme === "dark"
  const primaryColor = isDark ? "#7ccf00" : "#9ae600"
  const gradientColors = isDark
    ? [primaryColor, primaryColor, primaryColor, "#1c1917"]
    : [primaryColor, primaryColor, primaryColor, "#ffffff"]

  if (!isHydrated) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-15 dark:opacity-20">
      <MeshGradient
        colors={gradientColors}
        speed={0.5}
        distortion={0.38}
        swirl={0.15}
        style={{ width: "100%", height: "100%" }}
      />
      <div className="absolute inset-0 bg-background/35" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle, transparent 16%, var(--background) 92%)",
        }}
      />
    </div>
  )
}

/**
 * A still glow along the bottom edge, used behind the mobile channel list so
 * the screen is not a flat slab of background.
 *
 * Deliberately not the MeshGradient above: that one animates on a
 * requestAnimationFrame loop, which is fine behind an empty state but not
 * behind a list someone scrolls for minutes. StaticRadialGradient defaults to
 * speed 0, and ShaderMount drops its rAF entirely once the speed is 0 — it
 * draws a single frame and then idles.
 *
 * The opacity stays low and the mask fades the glow out well before the list
 * gets dense, because channel rows are transparent until hovered and the genre
 * line underneath is the lowest-contrast text in the app.
 */
export function BottomGlowBackdrop() {
  const { resolvedTheme } = useTheme()
  const isHydrated = useHydratedLayout()

  if (!isHydrated) {
    return null
  }

  const isDarkTheme = resolvedTheme === "dark"
  const glowColor = isDarkTheme ? "#7ccf00" : "#9ae600"
  const glowHighlight = isDarkTheme ? "#a3e635" : "#bef264"
  const fadeUpwards = "linear-gradient(to top, black 0%, transparent 100%)"

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-64 overflow-hidden opacity-[0.16] dark:opacity-25"
      style={{ maskImage: fadeUpwards, WebkitMaskImage: fadeUpwards }}
    >
      <StaticMeshGradient
        speed={0}
        colors={[glowColor, glowHighlight, glowColor, glowHighlight]}
        positions={2}
        waveX={0.8}
        waveY={0.6}
        waveXShift={0.5}
        waveYShift={0.35}
        mixing={0.95}
        grainMixer={0.6}
        grainOverlay={0.35}
        scale={1.6}
        originY={1}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  )
}
