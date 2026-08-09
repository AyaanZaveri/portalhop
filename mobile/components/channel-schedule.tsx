import { useMemo } from "react"
import { ActivityIndicator, Text, View } from "react-native"
import { useQuery } from "@tanstack/react-query"
import { Image } from "expo-image"

import { proxyImageUrl } from "@portalhop/shared/image-proxy"

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
  const { colors, isDark } = useTheme()

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

      if (!response.ok)
        throw new Error(data.error || "Could not load the guide.")
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
      <Text className="font-sans text-muted-foreground px-4 py-8 text-center text-sm">
        {query.error.message}
      </Text>
    )
  }

  if (!days.length) {
    return (
      <Text className="font-sans text-muted-foreground px-4 py-8 text-center text-sm">
        No guide data for this channel.
      </Text>
    )
  }

  const now = Date.now()

  return (
    <View className="gap-5 px-4">
      {days.map(([day, programmes]) => (
        <View key={day} className="gap-2">
          <Text className="font-sans text-muted-foreground text-xs">
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

            // No outline on the current programme. The web has none either,
            // and the fill behind it is what marks it now.
            return (
              <View
                key={programme.id}
                className="gap-1.5 overflow-hidden rounded-xl p-3"
              >
                {/* The poster again, blurred, so the card takes the colours of
                    what is on it. The web does the same and fades it leftward
                    with a mask; there is no mask here, so it washes the whole
                    card instead and runs quieter to make up for it.

                    blurRadius rather than a blur drawn at runtime. This one is
                    a decode-time transformation, cached as its own bitmap, so
                    it costs once per poster — where a Skia or SVG blur would
                    cost per card per frame, and this guide mounts every card
                    at once rather than virtualising them. */}
                {programme.posterUrl ? (
                  <Image
                    source={{ uri: proxyImageUrl(programme.posterUrl) }}
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      bottom: 0,
                      left: 0,
                      opacity: isDark ? 0.24 : 0.14,
                    }}
                    contentFit="cover"
                    blurRadius={28}
                    // Slower than the poster's own fade, so the colour arrives
                    // after the picture rather than with it.
                    transition={220}
                    pointerEvents="none"
                  />
                ) : null}

                {/* A fill layer rather than a colour on the card itself: the
                    alpha cannot be applied to the theme's oklch token without
                    taking it apart, and putting opacity on the card would fade
                    its text with it.

                    What is on now is tinted with the primary instead of muted,
                    and the elapsed share of it is tinted again on top. The card
                    already is a span of time, so filling it says how far
                    through that span the clock is — which a separate bar was
                    saying a second time, in less space, less clearly.

                    Both tints are very faint on purpose, and lighter than they
                    first were. The description is muted grey, and grey over a
                    saturated wash goes muddy long before the wash itself looks
                    strong — so the ceiling here is set by the least contrasty
                    text on the card, not by what reads well behind the title. */}
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    backgroundColor: isNow ? colors.primary : colors.muted,
                    opacity: isNow ? 0.07 : 0.2,
                  }}
                />

                {isNow ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: `${progressOf({ title: "", startAt, stopAt }, now) * 100}%`,
                      backgroundColor: colors.primary,
                      opacity: 0.09,
                    }}
                  />
                ) : null}
                <View className="flex-row items-start gap-3">
                  <View className="min-w-0 flex-1 gap-1.5">
                    {/* A step up across the card. At 14 and 12 this read as
                        fine print next to the rest of the app, and a guide is
                        meant to be skimmed. */}
                    {/* Medium, matching the times on a channel row. Same job,
                        same relationship to the title under it, so the guide
                        should not set them a weight lighter than the list the
                        user just came from. */}
                    <Text className="text-muted-foreground font-mono-medium text-xs">
                      {formatRange(startAt, stopAt)}
                    </Text>

                    <Text className="text-foreground font-rounded text-[15px]">
                      {programme.title}
                    </Text>

                    {programme.description ? (
                      <Text
                        numberOfLines={3}
                        className="font-sans text-muted-foreground text-[13px]"
                        style={{ lineHeight: 18 }}
                      >
                        {programme.description}
                      </Text>
                    ) : null}
                  </View>

                  {/* The web's 5:7 poster, at the width a phone can spare. It
                      goes through the shared image proxy for the same reason
                      the web does: these come from arbitrary EPG hosts, and the
                      proxy resizes them rather than pulling a full-size still
                      down for a thumbnail. */}
                  {programme.posterUrl ? (
                    <Image
                      source={{ uri: proxyImageUrl(programme.posterUrl) }}
                      style={{
                        width: 60,
                        height: 84,
                        borderRadius: 8,
                        backgroundColor: colors.muted,
                      }}
                      contentFit="cover"
                      transition={140}
                    />
                  ) : null}
                </View>
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
