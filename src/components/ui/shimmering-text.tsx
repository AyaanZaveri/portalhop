"use client"

import { useMemo, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

type ShimmeringTextProps = {
  text: string
  duration?: number
  className?: string
  spread?: number
  color?: string
  shimmerColor?: string
}

export function ShimmeringText({
  text,
  duration = 2,
  className,
  spread = 2,
  color = "var(--muted-foreground)",
  shimmerColor = "var(--primary)",
}: ShimmeringTextProps) {
  const dynamicSpread = useMemo(() => text.length * spread, [spread, text])

  return (
    <span
      className={cn(
        "inline-block animate-shimmer-text bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        className
      )}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          backgroundImage:
            "linear-gradient(90deg, transparent calc(50% - var(--spread)), var(--shimmer-color), transparent calc(50% + var(--spread))), linear-gradient(var(--text-color), var(--text-color))",
          "--text-color": color,
          "--shimmer-color": shimmerColor,
          animationDuration: `${duration}s`,
        } as CSSProperties
      }
    >
      {text}
    </span>
  )
}
