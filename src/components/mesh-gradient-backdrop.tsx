"use client"

import { MeshGradient } from "@paper-design/shaders-react"
import { useTheme } from "next-themes"
import { useHydratedLayout } from "@/hooks/use-hydrated-layout"
import { cn } from "@/lib/utils"

export function PrimaryMeshGradientBackdrop({
  color,
  intensity = "subtle",
}: {
  /**
   * The colour to run the gradient in. Defaults to the app's own green, which
   * is what every placeholder wants: nothing is selected, so there is nothing
   * for it to be the colour of.
   *
   * Behind a channel it is that channel's, taken from the same pass that tints
   * its logo tile — see src/lib/logo-analysis. Two shades of the same colour
   * are already on screen, the tile and this, and they should be the one
   * colour or the pairing looks like an accident.
   */
  color?: string
  /**
   * How far forward the colour comes.
   *
   * "subtle" is the placeholder's: a wash under an empty panel, where the only
   * thing on screen is a line of grey text and the gradient must not become the
   * subject. "vivid" is for a band behind something with its own weight — a
   * header and a playing picture.
   *
   * The difference is where the colour is more than how much of it there is.
   * Both fade to the page colour; subtle does it from a circle in the middle of
   * its box, vivid from the top edge, because a panel whose middle is a video
   * has only its top to show anything in. Raising opacity to compensate for
   * colour hidden behind the picture just makes the strip above it garish.
   */
  intensity?: "subtle" | "vivid"
}) {
  const { resolvedTheme } = useTheme()
  const isHydrated = useHydratedLayout()

  const isDark = resolvedTheme === "dark"
  const primaryColor = color ?? (isDark ? "#7ccf00" : "#9ae600")
  const gradientColors = isDark
    ? [primaryColor, primaryColor, primaryColor, "#1c1917"]
    : [primaryColor, primaryColor, primaryColor, "#ffffff"]

  if (!isHydrated) {
    return null
  }

  const isVivid = intensity === "vivid"

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        isVivid ? "opacity-15 dark:opacity-30" : "opacity-15 dark:opacity-20",
      )}
    >
      <MeshGradient
        colors={gradientColors}
        speed={0.5}
        distortion={0.38}
        swirl={0.15}
        style={{ width: "100%", height: "100%" }}
      />
      <div
        className={cn(
          "absolute inset-0",
          isVivid ? "bg-background/20" : "bg-background/35",
        )}
      />
      <div
        className="absolute inset-0"
        style={{
          background: isVivid
            ? // Anchored to the top edge rather than centred. A centred circle
              // puts its clear middle halfway down the band, which behind a
              // channel is exactly where the picture sits — so the colour was
              // brightest under the one opaque thing on the panel, and what
              // showed around it was already the falloff.
              "radial-gradient(ellipse 130% 100% at 50% 0%, transparent 0%, var(--background) 78%)"
            : "radial-gradient(circle, transparent 16%, var(--background) 92%)",
        }}
      />
    </div>
  )
}
