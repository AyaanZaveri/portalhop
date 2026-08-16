import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import Animated, { FadeIn } from "react-native-reanimated"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { router, useLocalSearchParams } from "expo-router"
import { ChevronLeft, RadioTower } from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme, withAlpha } from "@/lib/theme"
import {
  frameRateLabel,
  resolutionLabel,
  type StreamInfo,
} from "@portalhop/shared/stream-info"
import { useSession } from "@/lib/auth"
import {
  useCachedStreams,
  usePortals,
  type PortalChannelWithSource,
} from "@/lib/channels"
import { useChooseChannelSource } from "@/lib/source-order"
import { useLogoStyle } from "@/lib/logo-style"

import { TopGlow } from "@/components/top-glow"
import { ChannelLogo } from "@/components/channel-logo"
import { ChannelPlayer } from "@/components/channel-player"
import { ChannelSchedule } from "@/components/channel-schedule"
import { ChannelSourcesSheet } from "@/components/channel-sources-sheet"
import { PressableScale } from "@/components/ui/pressable-scale"

export default function ChannelDetailScreen() {
  // Fullscreen is the screen's business, not just the player's: what makes the
  // video fill the display is the header and guide standing down, so the player
  // is left as the only thing with room to grow. Keeping it here also means the
  // VideoView never moves in the tree, and so never restarts.
  const [fullscreen, setFullscreen] = useState(false)
  const {
    name,
    xmltvId,
    channelId,
    portalId,
    savedChannelId,
    logo,
    portalName,
  } = useLocalSearchParams<{
    slug: string
    name?: string
    xmltvId?: string
    channelId?: string
    portalId?: string
    savedChannelId?: string
    logo?: string
    portalName?: string
  }>()
  const insets = useSafeAreaInsets()
  const { colors, isDark } = useTheme()

  // The portal record carries the EPG mode and, for a Stalker source, the
  // endpoint and credentials the guide request needs. Read from the cached
  // portals query rather than threaded through the route: it is small, already
  // in memory, and passing credentials through a URL would be worse.
  const { data: session } = useSession()
  const { data: portals } = usePortals(Boolean(session?.user))
  const portal = portals?.find((entry) => entry.id === Number(portalId))

  // The same verdict the tile uses, so the glow is the colour of the logo
  // sitting in front of it rather than a second guess at the channel's colour.
  // Already resolved and cached by the row the user tapped, so this costs
  // nothing here.
  const logoStyle = useLogoStyle(logo)

  /**
   * The two chips over the glow: the app's own muted surface, softened.
   *
   * Opaque, it was the brightest thing on the row. Black at part strength
   * fixed that and introduced a colour from nowhere — a hole punched in the
   * glow rather than a control sitting on it. The palette's own step, at
   * three-fifths, is the same surface every sheet and row uses, with the
   * channel's colour showing through it.
   *
   * A hairline rather than a border. Light mode needs some edge — every
   * surface in that palette sits within a few points of white, so a fill alone
   * cannot be seen — but a one-point line is three physical pixels on a phone
   * and reads as drawn. StyleSheet.hairlineWidth is the thinnest line the
   * screen can make, which is the difference between an edge and an outline.
   */
  const chipBackground = withAlpha(colors.muted, isDark ? 0.6 : 0.75)

  /**
   * Switching stream without leaving the channel.
   *
   * The streams are read from the cached catalogues when the badge is tapped
   * rather than on mount, so a screen that only ever plays costs nothing for a
   * picker nobody opened. Choosing writes the channel's default and then moves
   * the route's own parameters — the player keys its link on savedChannelId, so
   * that is the whole switch; nothing here reaches into it.
   */
  const sourcesSheet = useRef<BottomSheetModal>(null)
  // What the player found the stream to be, once it has parsed enough of it.
  // Absent until then, and absent for good on a stream that declares nothing —
  // which is a truthful blank rather than a guess.
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null)
  // Resolution and frame rate here; the bandwidth is stored and shown in the
  // sources sheet, where comparing two portals is the point. Under a channel's
  // name it would be a third figure saying what the first two already imply.
  const badges = [
    resolutionLabel(streamInfo ?? {}),
    frameRateLabel(streamInfo ?? {}),
  ].filter((label): label is string => Boolean(label))
  const getStreams = useCachedStreams(Boolean(session?.user))
  const chooseSource = useChooseChannelSource()
  // Resolved once for the screen rather than on the tap, so the badge only
  // wears a chevron where there is somewhere to go. Reading the cache costs one
  // pass and no request; the memo re-runs when the chosen order changes.
  const streams = useMemo(() => getStreams(xmltvId), [getStreams, xmltvId])
  const activeKey = streams.find(
    (stream) => stream.savedChannelId === Number(savedChannelId),
  )?.key

  const openSources = useCallback(() => {
    if (streams.length > 1) sourcesSheet.current?.present()
  }, [streams])

  /**
   * The channel's first source plays, unless this viewing picked another.
   *
   * The row that was tapped already carries the chosen stream, so this agrees
   * with it in the ordinary case and does nothing. It is here for the case
   * where it cannot: the order arrives from the server on its own schedule, and
   * a channel opened before it lands opened on whichever stream the catalogue
   * happened to list first. Correcting it afterwards is the difference between
   * "the top of the list plays" being true always and being true usually.
   *
   * A source chosen from the sheet is exempt, permanently for this screen. That
   * choice is the whole point of the sheet, and moving off it a moment later
   * because the saved order disagrees would make the sheet useless.
   */
  const pickedThisViewing = useRef(false)
  // What was last corrected to, so a param that somehow does not take cannot
  // turn this into a loop that keeps asking for the same thing.
  const correctedTo = useRef<number | null>(null)

  useEffect(() => {
    if (pickedThisViewing.current) return

    const first = streams[0]
    if (!first || first.savedChannelId == null) return
    if (first.savedChannelId === Number(savedChannelId)) return
    if (correctedTo.current === first.savedChannelId) return

    correctedTo.current = first.savedChannelId
    router.setParams({
      savedChannelId: String(first.savedChannelId),
      portalId: String(first.portalSource?.id ?? ""),
      portalName: first.portalSource?.name ?? "",
    })
  }, [savedChannelId, streams])

  const chooseStream = useCallback(
    (stream: PortalChannelWithSource) => {
      sourcesSheet.current?.dismiss()
      pickedThisViewing.current = true

      // Stamped by useCachedStreams, which has already decided whether this
      // guide id is an identity or a label the portal writes on everything.
      const identityKey = stream.identityKey
      if (identityKey && stream.savedChannelId != null) {
        chooseSource.mutate({
          identityKey,
          savedChannelIds: [
            stream.savedChannelId,
            ...streams
              .filter((entry) => entry.key !== stream.key)
              .map((entry) => entry.savedChannelId),
          ].filter((id): id is number => typeof id === "number"),
        })
      }

      router.setParams({
        savedChannelId: String(stream.savedChannelId ?? ""),
        portalId: String(stream.portalSource?.id ?? ""),
        portalName: stream.portalSource?.name ?? "",
      })
    },
    [chooseSource, streams],
  )

  return (
    <View
      className="bg-background flex-1"
      style={{ paddingTop: fullscreen ? 0 : insets.top }}
    >
      {/* Behind the header, and gone in fullscreen along with it — the point of
          fullscreen is that nothing but the video is on screen. Drawn before
          the header so it sits under it without needing a z-index. */}
      {fullscreen ? null : <TopGlow color={logoStyle.color} />}
      {/* The way back, and the way to another source. The channel says who it
          is under the video now — a header above the player named a channel the
          viewer could not see yet, and pushed the video down the screen to do
          it — so what is left up here are the two controls, one at each end. */}
      {fullscreen ? null : (
        <View className="flex-row items-center justify-between px-4 pt-2 pb-1">
          <PressableScale
            preset="icon"
            hitSlop={8}
            onPress={() => router.back()}
            // A surface of its own, because it sits over the glow rather than
            // over the page, and an unbacked glyph on a colour that changes per
            // channel is legible by luck.
            //
            // Translucent rather than the muted token: that token is a step
            // *up* from the background, so on a dark screen the chips came out
            // lighter than everything around them and read as the brightest
            // thing in the row. Ink of the opposite kind, at part strength,
            // separates the glyph from the glow without adding a highlight.
            className="size-9 items-center justify-center rounded-lg"
            style={{
              backgroundColor: chipBackground,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            }}
          >
            <ChevronLeft size={22} color={colors.foreground} />
          </PressableScale>

          {/* A transmitter, not a stack. This chip names the one source that is
              feeding the picture; layers would be describing the drawer behind
              it, which is the part about there being several. */}
          {portalName ? (
            <PressableScale
              preset="icon"
              hitSlop={8}
              onPress={openSources}
              className="h-9 flex-row items-center gap-1.5 rounded-lg px-2.5"
              style={{
                backgroundColor: chipBackground,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
              }}
            >
              <RadioTower size={14} color={colors["muted-foreground"]} />
              <Text
                numberOfLines={1}
                // font-medium is a *family* here, not a weight. Each weight is
                // registered as its own family because Android does not
                // synthesise bold, so pairing it with font-sans would be two
                // family utilities fighting and the regular face winning --
                // naming the one family is the whole instruction.
                className="text-foreground max-w-28 font-medium text-xs"
                style={{ lineHeight: 15, includeFontPadding: false }}
              >
                {portalName}
              </Text>
            </PressableScale>
          ) : null}
        </View>
      )}

      {/* Outside the ScrollView on purpose: a scrolling child cannot flex to
          fill the screen, and this has to be able to. */}
      <ChannelPlayer
        sourceId={Number(portalId)}
        savedChannelId={Number(savedChannelId)}
        fullscreen={fullscreen}
        onFullscreenChange={setFullscreen}
        onStreamInfo={setStreamInfo}
      />

      {/* Above the scroller, not inside it. It names what is being scrolled,
          so it is the last thing that should leave with it -- the listings are
          long enough on a phone that a few cards used to take the channel's own
          name off the screen. */}
      {fullscreen ? null : (
        <View>
          {/* Who this is, under the picture it belongs to.

              The name and nothing else. The category was the portal's filing of
              its own copy -- "SPORTS | GENERAL" -- so it changed with the source
              and said nothing about the channel; the web dropped it from the
              player for the same reason. What is on now is in the guide a few
              points below, where it belongs.

              Sixteen points of clearance underneath, against two inside the
              block. The gap between two groups has to beat the gaps within one
              or the grouping reads as noise, and the day heading was sitting
              closer to the category line than the category line was to the
              name. */}
          <View className="flex-row items-center gap-3 px-4 pt-1 pb-4">
            <ChannelLogo uri={logo} />

            <View className="min-w-0 flex-1 gap-1.5">
              <Text
                numberOfLines={1}
                className="text-foreground font-semibold text-[19px] tracking-tight"
                // Above the sixteen-point day headings below it: a page's own
                // title should not be the same size as the headings inside it.
                style={{ lineHeight: 23, includeFontPadding: false }}
              >
                {name || "Live stream"}
              </Text>

              {/* Two badges rather than one string: they are two separate facts
                  about the stream, and a single line joined by a dot reads as
                  one.
                  
                  They fade in rather than appear. A track's figures arrive a
                  second or two after the picture — the stream has to declare
                  them — so the block grows once, under a name that has already
                  settled, and a fade is what keeps that from reading as a jolt.
                  Tabular figures for the same reason mono was tempting: 1080p
                  and 720p should be the same width without a mono face doing
                  the whole label in typewriter. */}
              {badges.length ? (
                <Animated.View
                  entering={FadeIn.duration(180)}
                  className="flex-row items-center gap-1.5"
                >
                  {badges.map((label) => (
                      <View
                        key={label}
                        className="h-5 justify-center rounded-md px-1.5"
                        style={{ backgroundColor: withAlpha(colors.muted, 0.8) }}
                      >
                        <Text
                          className="text-muted-foreground font-medium text-[10px]"
                          style={{
                            includeFontPadding: false,
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {label}
                        </Text>
                      </View>
                  ))}
                </Animated.View>
              ) : null}
            </View>
          </View>
        </View>
      )}

      {fullscreen ? null : (
        <ScrollView
          // Takes exactly what is left under the fixed block and scrolls inside
          // it. Without the flex it measures to its content, which is what lets
          // a long guide push past the bottom of the screen instead of moving.
          className="flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          <ChannelSchedule
            portal={portal}
            channelId={channelId}
            channelName={name}
            xmltvId={xmltvId}
          />
        </ScrollView>
      )}

      <ChannelSourcesSheet
        ref={sourcesSheet}
        streams={streams}
        activeKey={activeKey}
        onChoose={chooseStream}
      />
    </View>
  )
}
