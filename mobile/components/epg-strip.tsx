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
export function EpgStrip({
  programme,
  color,
}: {
  programme: NowPlaying
  /**
   * The channel's own colour, drawn from its logo. Falls back to the app's
   * primary when a logo yields nothing usable, so a bar is never colourless.
   */
  color?: string | null
}) {
  const { colors } = useTheme()
  // Read at render rather than passed in. The provider hands down a new map on
  // every tick, so a row with a strip re-renders on the same 30s cadence and
  // picks the clock up here — one less prop to thread through a recycled row.
  const progress = progressOf(programme, Date.now())

  return (
    <>
      <Text
        numberOfLines={1}
        className="font-rounded text-foreground text-xs"
        // 0.8 opacity rather than a foreground/80 colour: it is the same result
        // against an opaque row, and it does not need the theme's oklch token
        // taken apart to apply an alpha to it. Matches the web's text-foreground/80.
        style={{
          lineHeight: 15,
          includeFontPadding: false,
          marginTop: 2,
          opacity: 0.8,
        }}
      >
        {programme.title}
      </Text>

      {/* Start, bar, end on one line, as the web has it. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginTop: 3,
        }}
      >
        <Text
          className="text-muted-foreground font-mono-medium text-[10px]"
          // Mono keeps the digits an even width, so the bar between the two
          // times holds still as the clock advances rather than twitching on
          // every tick.
          //
          // Medium rather than regular. These are the smallest thing in the
          // row and already held back twice, by size and by the muted colour;
          // at regular they were held back a third time, by weight, which is
          // one more than a time anyone actually reads should carry. Weight is
          // the right one to give back because size and colour still do the
          // de-emphasising, so nothing is promoted past the title above.
          style={{
            lineHeight: 12,
            includeFontPadding: false,
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatTime(programme.startAt)}
        </Text>

        <View
          style={{
            flex: 1,
            height: 4,
            borderRadius: 999,
            overflow: "hidden",
            backgroundColor: colors.border,
          }}
        >
          <View
            style={{
              height: "100%",
              borderRadius: 999,
              // Percentage rather than a measured width: the row is recycled
              // and a layout pass per row per tick is the one thing this
              // cannot cost.
              width: `${progress * 100}%`,
              backgroundColor: color ?? colors.primary,
            }}
          />
        </View>

        <Text
          className="text-muted-foreground font-mono-medium text-[10px]"
          style={{
            lineHeight: 12,
            includeFontPadding: false,
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatTime(programme.stopAt)}
        </Text>
      </View>
    </>
  )
}
