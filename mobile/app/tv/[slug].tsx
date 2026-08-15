import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ScrollView, Text, View } from "react-native"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { router, useLocalSearchParams } from "expo-router"
import { ChevronLeft, Layers, Tv } from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/lib/theme"
import { useSession } from "@/lib/auth"
import {
  useCachedStreams,
  usePortals,
  type PortalChannelWithSource,
} from "@/lib/channels"
import { useChooseChannelSource } from "@/lib/source-order"
import { useLogoStyle } from "@/lib/logo-style"

import { CategoryVisual } from "@/components/category-visual"
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
    genre,
    portalName,
  } = useLocalSearchParams<{
    slug: string
    name?: string
    xmltvId?: string
    channelId?: string
    portalId?: string
    savedChannelId?: string
    logo?: string
    genre?: string
    portalName?: string
  }>()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()

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
   * Switching stream without leaving the channel.
   *
   * The streams are read from the cached catalogues when the badge is tapped
   * rather than on mount, so a screen that only ever plays costs nothing for a
   * picker nobody opened. Choosing writes the channel's default and then moves
   * the route's own parameters — the player keys its link on savedChannelId, so
   * that is the whole switch; nothing here reaches into it.
   */
  const sourcesSheet = useRef<BottomSheetModal>(null)
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
        <View className="flex-row items-center justify-between px-3 pt-2 pb-1">
          <PressableScale
            preset="icon"
            hitSlop={8}
            onPress={() => router.back()}
            // A surface of its own. It sits over the glow rather than over the
            // page, and an unbacked glyph on a colour that changes per channel
            // is legible by luck.
            className="bg-muted size-9 items-center justify-center rounded-lg"
          >
            <ChevronLeft size={22} color={colors.foreground} />
          </PressableScale>

          {/* Layers, the same icon the web's sources control wears. */}
          {portalName ? (
            <PressableScale
              preset="icon"
              hitSlop={8}
              onPress={openSources}
              className="bg-muted h-9 flex-row items-center gap-1.5 rounded-lg px-2.5"
            >
              <Layers size={14} color={colors["muted-foreground"]} />
              <Text
                numberOfLines={1}
                className="font-sans text-foreground max-w-28 text-xs"
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
      />

      {fullscreen ? null : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Who this is, under the picture it belongs to. */}
          <View className="flex-row items-center gap-3 px-4 pt-1">
            <ChannelLogo uri={logo} />

            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="text-foreground font-rounded text-[17px] tracking-tight"
                style={{ lineHeight: 21, includeFontPadding: false }}
              >
                {name || "Live stream"}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 2,
                }}
              >
                <CategoryVisual
                  category={genre || "Uncategorized"}
                  size={12}
                  color={colors["muted-foreground"]}
                />
                <Text
                  numberOfLines={1}
                  className="font-sans text-muted-foreground shrink text-xs"
                  style={{ lineHeight: 15, includeFontPadding: false }}
                >
                  {genre || "Uncategorized"}
                </Text>
              </View>
            </View>

          </View>

          {/* Icon and weight follow the web's guide heading. */}
          <View className="flex-row items-center gap-2 px-4 pt-6 pb-3">
            {/* Optically centred against the text rather than mathematically:
              the icon's mass sits low next to a cap-height word, so it reads
              as sunk when its box is aligned. The web nudges the same icon by
              the same amount with -mt-0.5. */}
            <Tv
              size={16}
              color={colors["muted-foreground"]}
              style={{ marginTop: -2 }}
            />
            <Text className="font-heading text-foreground text-base">
              Programme Guide
            </Text>
          </View>

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
