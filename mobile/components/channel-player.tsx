import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { useEvent } from "expo"
import { VideoView, useVideoPlayer } from "expo-video"
import { useQuery } from "@tanstack/react-query"
import { Maximize, Pause, Play, RotateCw } from "lucide-react-native"

import { resolveChannelLink } from "@/lib/stream"
import { PressableScale } from "@/components/ui/pressable-scale"

/** How long the controls stay up after a tap. */
const HIDE_AFTER_MS = 3500

export function ChannelPlayer({
  sourceId,
  savedChannelId,
}: {
  sourceId: number | undefined
  savedChannelId: number | undefined
}) {
  // Both must be real ids. The route hands these over as strings, and an absent
  // one becomes Number("") — which is 0, not NaN, so a plain isFinite check
  // would happily ask the server for channel zero.
  const canPlay =
    Number.isInteger(sourceId) &&
    (sourceId ?? 0) > 0 &&
    Number.isInteger(savedChannelId) &&
    (savedChannelId ?? 0) > 0

  /**
   * A Stalker link is short-lived and often single-use, so it is resolved at
   * play time and never cached — `staleTime: 0` with no retry, because retrying
   * a link that the portal has already burned just fails again more slowly.
   */
  const link = useQuery({
    queryKey: ["channel-link", sourceId, savedChannelId],
    enabled: canPlay,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => resolveChannelLink(sourceId!, savedChannelId!, signal),
  })

  const player = useVideoPlayer(link.data ?? null, (instance) => {
    instance.loop = false
    // Live television: there is nothing behind the live edge worth keeping, and
    // a deep buffer only widens the gap to it.
    instance.bufferOptions = { minBufferForPlayback: 2 }
    instance.play()
  })

  const { status, error } = useEvent(player, "statusChange", {
    status: player.status,
    error: undefined,
  })
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  })

  const viewRef = useRef<VideoView>(null)
  const [controlsVisible, setControlsVisible] = useState(true)

  // Controls fall away on their own, but never while paused — a paused player
  // with no controls gives you nothing to press.
  useEffect(() => {
    if (!controlsVisible || !isPlaying) return
    const timer = setTimeout(() => setControlsVisible(false), HIDE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [controlsVisible, isPlaying])

  const toggleControls = useCallback(() => {
    setControlsVisible((current) => !current)
  }, [])

  const togglePlayback = useCallback(() => {
    if (player.playing) player.pause()
    else player.play()
    setControlsVisible(true)
  }, [player])

  // A channel with no saved row behind it — a manual or M3U entry — has nothing
  // for /api/channel-link to resolve, so say so rather than spin forever.
  if (!canPlay) {
    return (
      <View className="mx-3 aspect-video items-center justify-center rounded-xl bg-black px-6">
        <Text className="text-center text-sm text-white/70">
          This channel has no stream to resolve.
        </Text>
      </View>
    )
  }

  const loading = link.isPending || status === "loading"
  const failed = link.error || status === "error"

  return (
    <View className="mx-3 aspect-video overflow-hidden rounded-xl bg-black">
      <VideoView
        ref={viewRef}
        player={player}
        style={{ flex: 1 }}
        // The whole point of this screen: our own controls over the video.
        // Native controls are forced back on in fullscreen by both platforms,
        // which is a limitation worth knowing rather than fighting.
        nativeControls={false}
        contentFit="contain"
        // Leaves the frame-rate strategy at ExoPlayer's default. Matching the
        // display to the video is what removes judder from 24fps film and
        // 60fps sport, and the case for turning it off — keeping a feed's UI at
        // 120Hz — does not apply to a screen that is mostly video.
      />

      <Pressable
        onPress={toggleControls}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      >
        {failed ? (
          <View className="flex-1 items-center justify-center gap-3 px-6">
            {/* The player's own message, not just ours. A generic "try again"
                hid the one detail that mattered when release builds refused
                every plain-HTTP stream: Android names that failure exactly. */}
            <Text className="text-center text-sm text-white">
              {link.error?.message ??
                error?.message ??
                "This channel would not play."}
            </Text>
            <PressableScale
              className="h-9 flex-row items-center gap-2 rounded-lg bg-white/15 px-3"
              onPress={() => void link.refetch()}
            >
              <RotateCw size={15} color="#fff" />
              <Text className="text-sm font-medium text-white">Try again</Text>
            </PressableScale>
          </View>
        ) : loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#fff" />
          </View>
        ) : controlsVisible ? (
          <View className="flex-1">
            {/* A scrim rather than a solid bar: the controls have to stay
                legible over whatever frame happens to be behind them. */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                backgroundColor: "rgba(0,0,0,0.35)",
              }}
            />

            <View className="flex-1 items-center justify-center">
              <PressableScale
                className="size-14 items-center justify-center rounded-full bg-white/20"
                onPress={togglePlayback}
              >
                {isPlaying ? (
                  <Pause size={24} color="#fff" fill="#fff" />
                ) : (
                  // Nudged right: a triangle's mass sits left of its bounding
                  // box, so a centred play glyph reads as off-centre.
                  <Play
                    size={24}
                    color="#fff"
                    fill="#fff"
                    style={{ marginLeft: 3 }}
                  />
                )}
              </PressableScale>
            </View>

            <View className="absolute bottom-0 left-0 right-0 flex-row items-center gap-2 p-3">
              <View className="flex-row items-center gap-1.5 rounded-md bg-black/50 px-2 py-1">
                <View className="size-1.5 rounded-full bg-red-500" />
                <Text className="text-[11px] font-medium tracking-wide text-white">
                  LIVE
                </Text>
              </View>

              <View className="flex-1" />

              <PressableScale
                preset="icon"
                hitSlop={8}
                className="size-9 items-center justify-center rounded-lg bg-black/50"
                onPress={() => void viewRef.current?.enterFullscreen()}
              >
                <Maximize size={18} color="#fff" />
              </PressableScale>
            </View>
          </View>
        ) : null}
      </Pressable>
    </View>
  )
}
