import { Text, View } from "react-native"

import type { NowPlaying } from "@/lib/epg"
import { useTheme } from "@/lib/theme"

/** How far through the programme the clock is, clamped so a stale slot cannot overrun the bar. */
export function progressOf(programme: NowPlaying, now: number) {
  const span = programme.stopAt - programme.startAt
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, (now - programme.startAt) / span))
}

export function formatTime(at: number) {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * The now-playing line under a channel name: title, and a bar showing how much
 * of it is left.
 *
 * The bar is deliberately the only moving part. A row is 64pt tall and already
 * carries a logo, a name and a category, so the guide has to earn its place in
 * about fourteen points of height.
 */
export function EpgStrip({ programme }: { programme: NowPlaying }) {
  const { colors } = useTheme()
  // Read at render rather than passed in. The provider hands down a new map on
  // every tick, so a row with a strip re-renders on the same 30s cadence and
  // picks the clock up here — one less prop to thread through a recycled row.
  const progress = progressOf(programme, Date.now())

  return (
    <View style={{ marginTop: 3, gap: 3 }}>
      <Text
        numberOfLines={1}
        className="text-xs text-foreground"
        style={{ lineHeight: 14, includeFontPadding: false }}
      >
        {programme.title}
      </Text>
      <View
        style={{
          height: 2,
          borderRadius: 1,
          overflow: "hidden",
          backgroundColor: colors.border,
        }}
      >
        <View
          style={{
            height: "100%",
            borderRadius: 1,
            // Percentage rather than a measured width: the row is recycled and
            // a layout pass per row per tick is the one thing this cannot cost.
            width: `${progress * 100}%`,
            backgroundColor: colors.primary,
          }}
        />
      </View>
    </View>
  )
}
