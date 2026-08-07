import { useMemo } from "react"
import { ActivityIndicator, Text, View } from "react-native"
import { useQuery } from "@tanstack/react-query"

import type { EpgProgramme } from "@portalhop/shared/stalker-types"
import type { SavedSourceRecord } from "@portalhop/shared/source-types"

import { apiFetch } from "@/lib/api"
import { useTheme } from "@/lib/theme"
import { progressOf } from "@/components/epg-strip"

/**
 * The programme guide for one channel, from /api/channel-epg.
 *
 * The same endpoint the web's guide uses, and deliberately not the now-window
 * the list rows are built on. That window is six hours wide and keyed by
 * country; this looks a month ahead, asks a Stalker portal for its own guide
 * when the source is in portal mode, and resolves a custom EPG source by
 * matching on channel id or name. A channel whose next event is days away —
 * which is most of what a custom source carries — has nothing at all in the
 * six-hour window, which is why reading the guide from there showed nothing.
 */
export function ChannelSchedule({
  portal,
  channelId,
  channelName,
  xmltvId,
}: {
  portal: SavedSourceRecord | undefined
  channelId: string | undefined
  channelName: string | undefined
  xmltvId: string | undefined
}) {
  const { colors } = useTheme()

  const query = useQuery({
    queryKey: ["channel-epg", portal?.id, channelId, xmltvId],
    enabled: Boolean(channelId || channelName || xmltvId),
    queryFn: async () => {
      // The whole source record goes in: the portal-mode branch needs the
      // endpoint and credentials to ask the portal itself, and the handler
      // reads sourceType to know an Xtream or M3U source has no guide.
      const response = await apiFetch("/api/channel-epg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(portal ?? {}),
          epgMode: portal?.epgMode ?? "portal",
          epgSourceId: portal?.epgSourceId ?? null,
          endpoint: portal?.endpoint ?? null,
          channelId,
          channelName,
          xmltvId,
        }),
      })

      const data = (await response.json().catch(() => ({}))) as {
        programmes?: EpgProgramme[]
        error?: string
      }

      if (!response.ok) throw new Error(data.error || "Could not load the guide.")
      return data.programmes ?? []
    },
  })

  // Grouped by day, as the web's guide is — a flat list of times is unreadable
  // once it runs past midnight.
  const days = useMemo(() => {
    const grouped = new Map<string, EpgProgramme[]>()

    for (const programme of query.data ?? []) {
      const day = new Date(programme.startAt).toDateString()
      const entries = grouped.get(day) ?? []
      entries.push(programme)
      grouped.set(day, entries)
    }

    return [...grouped.entries()]
  }, [query.data])

  if (query.isPending) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator />
      </View>
    )
  }

  if (query.error) {
    return (
      <Text className="px-4 py-8 text-center text-sm text-muted-foreground">
        {query.error.message}
      </Text>
    )
  }

  if (!days.length) {
    return (
      <Text className="px-4 py-8 text-center text-sm text-muted-foreground">
        No guide data for this channel.
      </Text>
    )
  }

  const now = Date.now()

  return (
    <View className="gap-5 px-4">
      {days.map(([day, programmes]) => (
        <View key={day} className="gap-2">
          <Text className="text-xs text-muted-foreground">
            {new Date(day).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>

          {programmes.map((programme) => {
            const startAt = new Date(programme.startAt).getTime()
            const stopAt = new Date(programme.stopAt).getTime()
            const isNow = startAt <= now && stopAt > now

            return (
              <View
                key={programme.id}
                className="gap-1.5 overflow-hidden rounded-xl p-3"
                style={{
                  // Only what is on now is outlined. A border on every card
                  // turns the list into a grid and buries the one row that
                  // answers "what is on".
                  borderWidth: isNow ? 1 : 0,
                  borderColor: isNow ? colors.primary : "transparent",
                }}
              >
                {/* The web's bg-muted/20. A fill layer rather than a colour on
                    the card itself: the alpha cannot be applied to the theme's
                    oklch token without taking it apart, and putting opacity on
                    the card would fade its text with it. `card` was the obvious
                    token and the wrong one — it is white in light mode, so the
                    cards were invisible against the page. */}
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    backgroundColor: colors.muted,
                    opacity: 0.2,
                  }}
                />
                <Text className="font-mono text-[11px] text-muted-foreground">
                  {formatRange(startAt, stopAt)}
                </Text>

                <Text className="text-sm font-medium text-foreground">
                  {programme.title}
                </Text>

                {programme.description ? (
                  <Text
                    numberOfLines={3}
                    className="text-xs text-muted-foreground"
                    style={{ lineHeight: 16 }}
                  >
                    {programme.description}
                  </Text>
                ) : null}

                {isNow ? (
                  <View
                    style={{
                      height: 3,
                      borderRadius: 999,
                      overflow: "hidden",
                      marginTop: 2,
                      // The web's track is bg-muted, which reads against the
                      // card's lighter fill where the border token would not.
                      backgroundColor: colors.muted,
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        borderRadius: 999,
                        width: `${progressOf({ title: "", startAt, stopAt }, now) * 100}%`,
                        backgroundColor: colors.primary,
                      }}
                    />
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function formatRange(startAt: number, stopAt: number) {
  const time = (at: number) =>
    new Date(at).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  return `${time(startAt)} - ${time(stopAt)}`
}
