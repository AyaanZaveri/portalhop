"use client"

import { DotGrid, MeshGradient } from "@paper-design/shaders-react"
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
 * behind a list someone scrolls for minutes. DotGrid takes no speed or frame
 * param at all — it is a pattern shader, so it draws once and never schedules
 * another frame.
 *
 * sizeRange and opacityRange are what keep it from reading as graph paper: the
 * dots vary enough to look scattered rather than ruled, which matters behind
 * rows that already have their own rhythm.
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
  const fadeUpwards = "linear-gradient(to top, black 0%, transparent 100%)"

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-64 overflow-hidden opacity-30 dark:opacity-45"
      style={{ maskImage: fadeUpwards, WebkitMaskImage: fadeUpwards }}
    >
      <DotGrid
        colorBack="rgba(0, 0, 0, 0)"
        colorFill={glowColor}
        colorStroke="rgba(0, 0, 0, 0)"
        strokeWidth={0}
        shape="circle"
        size={2.4}
        gapX={20}
        gapY={20}
        sizeRange={0.6}
        opacityRange={0.9}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  )
}
