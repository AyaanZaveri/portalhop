import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { useEvent } from "expo"
import { VideoView, useVideoPlayer } from "expo-video"
import { useQuery } from "@tanstack/react-query"
import * as Haptics from "expo-haptics"
import {
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react-native"

import { resolveChannelLink } from "@/lib/stream"
import { PressableScale } from "@/components/ui/pressable-scale"

/** How long the controls stay up after a tap. */
const HIDE_AFTER_MS = 3500

/** Landscape and filling the screen, which is the only reason to go fullscreen on a phone. */
const FULLSCREEN = { enable: true, orientation: "landscape" as const }

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
    queryFn: ({ signal }) =>
      resolveChannelLink(sourceId!, savedChannelId!, signal),
  })

  const player = useVideoPlayer(link.data ?? null, (instance) => {
    instance.loop = false
    // Live television: there is nothing behind the live edge worth keeping, and
    // a deep buffer only widens the gap to it.
    instance.bufferOptions = { minBufferForPlayback: 2 }
    // Watching an hour of television without touching the screen is the normal
    // case, and the display was going out on people mid-programme.
    instance.keepScreenOnWhilePlaying = true
    instance.play()
  })

  const { status, error } = useEvent(player, "statusChange", {
    status: player.status,
    error: undefined,
  })
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  })
  const { muted } = useEvent(player, "mutedChange", { muted: player.muted })

  const viewRef = useRef<VideoView>(null)
  const [controlsVisible, setControlsVisible] = useState(true)

  /**
   * The track, watched rather than read once.
   *
   * It was read at the first frame, which is too early for a stream that only
   * declares its bitrate once a segment or two has been parsed — hence the
   * badge appearing for some channels and not others. This also follows an
   * adaptive stream when it switches rendition.
   */
  const { videoTrack } = useEvent(player, "videoTrackChange", {
    videoTrack: player.videoTrack,
  })

  const height = videoTrack?.size?.height
  // averageBitrate and peakBitrate in preference to bitrate, which is
  // deprecated. Average describes what the stream is actually costing; peak is
  // the ceiling, and stands in when only it is known.
  //
  // A raw MPEG-TS stream declares neither, which is why the Xtream channels
  // show no bitrate: the library reports what the stream states about itself,
  // and there is no manifest there to state it. The web's figure is measured
  // rather than declared — hls.js weighs the bytes of each fragment — and
  // nothing expo-video exposes can be measured the same way.
  const bps = videoTrack?.averageBitrate ?? videoTrack?.peakBitrate ?? null
  // Frame rate comes off the video track itself, so it survives where the
  // bitrate does not — which is exactly the channels that would otherwise show
  // a resolution and nothing else. Rounded the way the web rounds it.
  const fps = videoTrack?.frameRate ?? null
  const stream =
    [
      height ? `${height}p` : null,
      fps
        ? `${Math.abs(fps - Math.round(fps)) < 0.05 ? Math.round(fps) : Number(fps.toFixed(2))} fps`
        : null,
      bps ? `${(bps / 1_000_000).toFixed(1)} Mbps` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null

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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (player.playing) player.pause()
    else player.play()
    setControlsVisible(true)
  }, [player])

  if (!canPlay) {
    return (
      <View className="mx-3 aspect-video items-center justify-center rounded-xl bg-black px-6">
        <Text className="text-center text-sm text-white/70">
          This channel has no stream to resolve.
        </Text>
      </View>
    )
  }

  const failed = link.error || status === "error"
  // Nothing on screen yet, versus a picture that has stalled. They want
  // different things said about them: one is opening the channel, the other is
  // the network faltering with a frame still showing.
  const opening = link.isPending || (status === "loading" && !stream)
  const stalled = status === "loading" && Boolean(stream)

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
        fullscreenOptions={FULLSCREEN}
        // The manifest flag that makes this possible on Android comes from the
        // expo-video config plugin, so it needs a build rather than a reload.
        allowsPictureInPicture
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
        ) : opening ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <View className="flex-1">
            {/* Stays up through a stall even when the controls have faded, so a
                picture that has stopped moving says why. */}
            {stalled ? (
              <View
                pointerEvents="none"
                className="absolute inset-0 items-center justify-center"
              >
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}

            {controlsVisible ? (
              <>
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

                {/* Hidden rather than removed while stalled, so the spinner has
                    the middle to itself and the layout does not jump. */}
                {!stalled ? (
                  <View className="flex-1 items-center justify-center">
                    <PressableScale
                      className="size-14 items-center justify-center rounded-full bg-white/20"
                      onPress={togglePlayback}
                    >
                      {isPlaying ? (
                        <Pause size={24} color="#fff" fill="#fff" />
                      ) : (
                        // Nudged right: a triangle's mass sits left of its
                        // bounding box, so a centred play glyph reads as
                        // off-centre.
                        <Play
                          size={24}
                          color="#fff"
                          fill="#fff"
                          style={{ marginLeft: 3 }}
                        />
                      )}
                    </PressableScale>
                  </View>
                ) : null}

                <View className="absolute right-0 bottom-0 left-0 flex-row items-center gap-2 p-3">
                  {/* Both badges take one fixed height rather than each being
                      sized by its own padding and type. A mono face and a sans
                      face at the same padding do not come out the same height,
                      which is why these did not line up. */}
                  <View className="h-6 flex-row items-center gap-1.5 rounded-md bg-black/50 px-2">
                    <View className="size-1.5 rounded-full bg-red-500" />
                    <Text
                      className="text-[11px] font-medium tracking-wide text-white"
                      style={{ includeFontPadding: false }}
                    >
                      LIVE
                    </Text>
                  </View>

                  {/* What the stream is actually delivering, as the web shows
                      it. Absent rather than guessed at when the track reports
                      nothing useful. */}
                  {stream ? (
                    <View className="h-6 justify-center rounded-md bg-black/50 px-2">
                      <Text
                        className="font-mono text-[11px] text-white/80"
                        style={{ includeFontPadding: false }}
                      >
                        {stream}
                      </Text>
                    </View>
                  ) : null}

                  <View className="flex-1" />

                  <PressableScale
                    preset="icon"
                    hitSlop={8}
                    className="size-9 items-center justify-center rounded-lg bg-black/50"
                    onPress={() => {
                      player.muted = !player.muted
                      setControlsVisible(true)
                    }}
                  >
                    {muted ? (
                      <VolumeX size={18} color="#fff" />
                    ) : (
                      <Volume2 size={18} color="#fff" />
                    )}
                  </PressableScale>

                  <PressableScale
                    preset="icon"
                    hitSlop={8}
                    className="size-9 items-center justify-center rounded-lg bg-black/50"
                    onPress={() =>
                      void viewRef.current?.startPictureInPicture()
                    }
                  >
                    <PictureInPicture2 size={18} color="#fff" />
                  </PressableScale>

                  <PressableScale
                    preset="icon"
                    hitSlop={8}
                    className="size-9 items-center justify-center rounded-lg bg-black/50"
                    onPress={() => void viewRef.current?.enterFullscreen()}
                  >
                    <Maximize size={18} color="#fff" />
                  </PressableScale>
                </View>
              </>
            ) : null}
          </View>
        )}
      </Pressable>
    </View>
  )
}
