import { useEffect, useState } from "react"
import { ActivityIndicator, Text, View } from "react-native"

import { querySchedule, type Programme } from "@/lib/epg"
import { useTheme } from "@/lib/theme"
import { formatTime, progressOf } from "@/components/epg-strip"

/**
 * The stored schedule for one channel.
 *
 * Read straight from SQLite rather than fetched: the list screen has already
 * written the guide file this channel belongs to, so opening a channel is a
 * local query rather than another download. It follows that a channel opened
 * without having been scrolled past has nothing to show yet — the empty state
 * says so rather than pretending the channel has no listings.
 */
export function ChannelSchedule({ xmltvId }: { xmltvId: string | undefined }) {
  const { colors } = useTheme()
  const [programmes, setProgrammes] = useState<Programme[] | null>(null)

  useEffect(() => {
    if (!xmltvId) {
      setProgrammes([])
      return
    }

    let cancelled = false
    void querySchedule(xmltvId, Date.now()).then((rows) => {
      if (!cancelled) setProgrammes(rows)
    })

    return () => {
      cancelled = true
    }
  }, [xmltvId])

  if (programmes === null) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator />
      </View>
    )
  }

  if (!programmes.length) {
    return (
      <Text className="px-4 py-8 text-center text-sm text-muted-foreground">
        No guide data for this channel.
      </Text>
    )
  }

  const now = Date.now()

  return (
    <View className="gap-3 px-4">
      {programmes.map((programme, index) => {
        const isNow = programme.startAt <= now && programme.stopAt > now

        return (
          <View
            key={`${programme.startAt}-${index}`}
            className="flex-row gap-3"
          >
            {/* Fixed width so every title starts on the same line, which is
                what makes a schedule scannable rather than ragged. */}
            <Text
              className="w-14 font-mono-medium text-xs text-muted-foreground"
              style={{ lineHeight: 18, includeFontPadding: false }}
            >
              {formatTime(programme.startAt)}
            </Text>

            <View className="min-w-0 flex-1 gap-1.5">
              <Text
                numberOfLines={2}
                className={
                  isNow
                    ? "text-sm font-medium text-foreground"
                    : "text-sm text-muted-foreground"
                }
                style={{ lineHeight: 18, includeFontPadding: false }}
              >
                {programme.title}
              </Text>

              {/* Only under what is actually on: a bar against a programme
                  three hours out would be an empty track saying nothing. */}
              {isNow ? (
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
                      width: `${progressOf(programme, now) * 100}%`,
                      backgroundColor: colors.primary,
                    }}
                  />
                </View>
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}
