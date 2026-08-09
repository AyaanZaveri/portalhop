import { useMemo, useState } from "react"
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
                  // The filter goes on a wrapper rather than on the image: it
                  // applies to a whole subtree either way, and expo-image's
                  // style union makes `filter` ambiguous with the array form.
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      bottom: 0,
                      left: 0,
                      opacity: isDark ? 0.2 : 0.12,
                      // Saturated, as the web saturates its own. This is what
                      // stops a red poster arriving as maroon: blurring averages
                      // a picture toward its middle, and the middle of any
                      // photograph is duller than the colours that make it up.
                      // Pushed back up and then run quieter than before, so the
                      // card gets a stronger colour and less of it.
                      filter: [{ saturate: 1.9 }, { contrast: 1.1 }],
                    }}
                  >
                    <Image
                      source={{ uri: proxyImageUrl(programme.posterUrl) }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                      blurRadius={28}
                      // Slower than the poster's own fade, so the colour arrives
                      // after the picture rather than with it.
                      transition={220}
                    />
                  </View>
                ) : null}

                {/* A fill layer rather than a colour on the card itself: the
                    alpha cannot be applied to the theme's oklch token without
                    taking it apart, and putting opacity on the card would fade
                    its text with it.

                    One fill for every card now, the web's bg-muted/20. What is
                    on now used to be tinted with the primary and its elapsed
                    share tinted again on top — the card is a span of time, so
                    filling it said how far through that span the clock was.

                    That held until the poster began colouring the card. Lime
                    laid over a programme's own colour is two colours fighting,
                    and matching the fill to the poster instead would have been
                    worse: fill and wash would be the same colour, and the
                    elapsed edge — the whole point of the fill — would vanish
                    into it. So the clock moves to a bar along the bottom, where
                    a single unmissable line of lime can sit over any colour
                    without arguing with it. It is what the web does, and why
                    the web never had this problem. */}
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

                {isNow ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      // Four, where the row's is five. They are not the same
                      // job: the row's is an inline meter between two times,
                      // this one runs the full width of a card, and a longer
                      // line carries the same weight with less height. Four
                      // rather than three because the leading cap is half the
                      // height, and at three there was not enough of it to
                      // read as round.
                      height: 4,
                      backgroundColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        width: `${progressOf({ title: "", startAt, stopAt }, now) * 100}%`,
                        backgroundColor: colors.primary,
                        // Only the leading end. The other one is against the
                        // card's own edge, where a cap would read as a gap
                        // rather than as a shape — this end is the one moving,
                        // and rounding it is what makes it a bar rather than a
                        // measurement drawn to a stop.
                        borderTopRightRadius: 999,
                        borderBottomRightRadius: 999,
                      }}
                    />
                  </View>
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
                    <ProgrammePoster
                      uri={proxyImageUrl(programme.posterUrl)}
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

/**
 * The width every poster shares, so the text beside them all ends in the same
 * place. Only the height moves.
 */
const POSTER_WIDTH = 60

/**
 * What the height may become, and where it starts.
 *
 * The fallback is the web's 5:7, which is what to draw before the picture has
 * arrived and said otherwise. The bounds keep a row of cards from going ragged:
 * a landscape still would otherwise come out a 34-point strip, and a very tall
 * one would push the card taller than its own text.
 */
const POSTER_FALLBACK_HEIGHT = 84
const POSTER_MIN_HEIGHT = 46
const POSTER_MAX_HEIGHT = 92

/**
 * A programme's poster, at the shape the poster actually is.
 *
 * XMLTV allows an icon to declare width and height, and this feed never does:
 * of 97,164 icons in the Canadian guide, none carries either attribute. Nor is
 * there one shape to assume. TSN alone serves SportsCentre at 600x900, a true
 * 2:3, and most of the rest at 680x907, which is 3:4 — so a single 5:7 box
 * crops the first top and bottom and the second at the sides, and a wide still
 * loses most of itself.
 *
 * The picture knows, even though the feed does not, so the box asks it on load
 * and takes its shape. Nothing is cropped, and a poster that is square arrives
 * square.
 */
function ProgrammePoster({ uri }: { uri: string }) {
  const { colors } = useTheme()
  const [height, setHeight] = useState(POSTER_FALLBACK_HEIGHT)

  return (
    <Image
      source={{ uri }}
      style={{
        width: POSTER_WIDTH,
        height,
        borderRadius: 8,
        backgroundColor: colors.muted,
        // Centred against the text beside it rather than top-aligned with it,
        // which is the web's self-center. The text block is one to four lines
        // depending on the description, so aligning to its top left the poster
        // hanging off a short card and floating on a tall one.
        alignSelf: "center",
      }}
      contentFit="cover"
      transition={140}
      onLoad={({ source }) => {
        if (!source.width || !source.height) return
        const next = Math.round(
          Math.min(
            POSTER_MAX_HEIGHT,
            Math.max(
              POSTER_MIN_HEIGHT,
              (POSTER_WIDTH * source.height) / source.width,
            ),
          ),
        )
        setHeight((current) => (current === next ? current : next))
      }}
    />
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
