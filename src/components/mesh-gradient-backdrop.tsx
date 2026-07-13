"use client"

import { MeshGradient } from "@paper-design/shaders-react"
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
