import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated"
import { useEvent } from "expo"
import { useNavigation } from "expo-router"
import {
  VideoView,
  useVideoPlayer,
  type SubtitleTrack,
  type VideoSource,
} from "expo-video"
import { useQuery } from "@tanstack/react-query"
import * as Haptics from "expo-haptics"

import { tick } from "@/lib/haptics"
import {
  Captions,
  CaptionsOff,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react-native"
import * as ScreenOrientation from "expo-screen-orientation"

import { useSettings } from "@/lib/channels"
import { useTheme } from "@/lib/theme"
import { StatusBar } from "expo-status-bar"
import { BackHandler } from "react-native"

import { resolveChannelLink } from "@/lib/stream"
import { useRecordStreamInfo } from "@/lib/stream-info"
import {
  bestStreamInfo,
  withNewReading,
  type StreamInfo,
} from "@portalhop/shared/stream-info"
import { PressableScale } from "@/components/ui/pressable-scale"

/** How long the controls stay up after a tap. */
const HIDE_AFTER_MS = 3500

/**
 * Off, then each track in turn, then off again.
 *
 * A list of tracks would need a surface to put it on, and a live stream almost
 * always carries one caption track -- where cycling is just a toggle. With
 * several, the control shows which one is on, so a second tap is an obvious way
 * to reach the next rather than a guess.
 */
function nextSubtitleTrack(
  tracks: SubtitleTrack[],
  current: SubtitleTrack | null,
) {
  if (!tracks.length) return null

  // id is Android-only, so the two have to be compared by what both platforms
  // report when it is absent.
  const sameTrack = (a: SubtitleTrack, b: SubtitleTrack) =>
    a.id !== undefined && b.id !== undefined
      ? a.id === b.id
      : a.language === b.language && a.label === b.label

  const index = current
    ? tracks.findIndex((track) => sameTrack(track, current))
    : -1
  const next = index + 1

  return next >= tracks.length ? null : tracks[next]
}

export function ChannelPlayer({
  sourceId,
  savedChannelId,
  fullscreen,
  onFullscreenChange,
  onStreamInfo,
  storedInfo,
  storedInfoLoaded,
}: {
  sourceId: number | undefined
  savedChannelId: number | undefined
  fullscreen: boolean
  onFullscreenChange: (next: boolean) => void
  /** What the stream turned out to be, for the block that names the channel. */
  onStreamInfo?: (info: StreamInfo) => void
  /**
   * What the table already says about this stream, where it says anything.
   *
   * The player starts from this rather than from nothing, which is what makes
   * the write conditional: with it, a phone that learns only the resolution can
   * tell that the resolution is already on file and say nothing at all.
   */
  storedInfo?: Partial<StreamInfo>
  /**
   * Whether the table has been read yet. Absent is not the same as empty, and
   * reporting before the read lands is reporting without knowing what is on
   * file -- see the effect that writes.
   */
  storedInfoLoaded?: boolean
}) {
  // The one palette value this overlay uses. Everything else here is white on
  // video rather than a themed surface, but an active control has to read as
  // active, and the app's lime is what says that everywhere else.
  const { iconPrimary } = useTheme()

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
  /**
   * The account's proxy preference, read the way the web reads it.
   *
   * Part of the link's query key rather than something applied afterwards: the
   * proxied and direct urls are different streams to resolve, and a setting
   * that arrives after playback started should re-resolve rather than leave the
   * player on the wrong one.
   *
   * Defaults to on while the settings request is in flight, which is the
   * server's default too — a portal that needs the proxy is broken without it,
   * and one that does not is merely taking a longer road.
   */
  const { data: settings } = useSettings(canPlay)
  const useProxy = settings?.useProxy ?? true

  const link = useQuery({
    queryKey: ["channel-link", sourceId, savedChannelId, useProxy],
    enabled: canPlay,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      resolveChannelLink(sourceId!, savedChannelId!, useProxy, signal),
  })

  /**
   * Labelled as HLS where the URL says so, and left alone otherwise.
   *
   * iOS only exposes a stream's tracks -- subtitles included -- once it knows
   * it is looking at a playlist, which it works out from the .m3u8 extension or
   * from being told. Portals hand back plenty of URLs that are HLS without
   * looking it, and the label costs nothing where it is already obvious. Where
   * the URL is not a playlist at all, saying so would be a lie the player would
   * act on, so it stays a bare string.
   */
  const source = useMemo<VideoSource>(() => {
    const uri = link.data
    if (!uri) return null
    return uri.includes(".m3u8") ? { uri, contentType: "hls" } : uri
  }, [link.data])

  const player = useVideoPlayer(source, (instance) => {
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

  /**
   * Subtitles, as the stream carries them.
   *
   * Nothing is decoded here, unlike the web build, which pulls CEA-608 cues out
   * of the HLS segments itself and draws them over the video. ExoPlayer and
   * AVPlayer already do that and already render the result inside the video
   * surface, so the whole job is choosing a track and letting the platform draw
   * it -- which also means the captions stay put in fullscreen and in
   * picture-in-picture, where an overlay of our own would not.
   */
  const { availableSubtitleTracks } = useEvent(
    player,
    "availableSubtitleTracksChange",
    { availableSubtitleTracks: player.availableSubtitleTracks },
  )
  const { subtitleTrack } = useEvent(player, "subtitleTrackChange", {
    subtitleTrack: player.subtitleTrack,
  })

  const viewRef = useRef<VideoView>(null)
  const [controlsVisible, setControlsVisible] = useState(true)

  /**
   * The video is taken down before the screen animates away.
   *
   * A SurfaceView is a separate native surface punched through the view
   * hierarchy rather than a view in it, so it cannot be transformed with its
   * parent: the screen slides out and the video stays put until it is destroyed,
   * which reads as a flash. The alternative is surfaceType="textureView", which
   * does animate — and tone-maps HDR down to SDR, which is the whole reason
   * SurfaceView is here.
   *
   * So the surface is unmounted the moment the screen is committed to leaving.
   * Its container keeps the same black box, so nothing moves; there is simply
   * no longer a surface to lag behind.
   */
  const navigation = useNavigation()
  const [leaving, setLeaving] = useState(false)

  useEffect(
    () =>
      navigation.addListener("beforeRemove", () => {
        setLeaving(true)
        // Nothing is going to be watched from here, and letting it run means
        // audio carrying over the transition.
        player.pause()
      }),
    [navigation, player],
  )

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

  // Whether anything has arrived yet, for the loading state below. What the
  // figures are is the screen's business, not this component's — see info.
  const stream = videoTrack?.size?.height ? "playing" : null

  /**
   * What the stream turned out to be, handed to whoever is drawing the
   * channel.
   *
   * The figures describe the stream, and the block under the video is where
   * this screen says what the stream is — so they belong there rather than
   * over the picture, where they sat on top of the thing they were describing
   * and left with the controls.
   *
   * No bitrate. It is the one figure here that is a live measurement rather
   * than a property: resolution and frame rate identify the rendition, and a
   * number that moves every few seconds does not belong in a block that names
   * the channel. The web keeps it, where the overlay it lives in is transient
   * and the screen has room.
   */
  /**
   * The four figures, rebuilt only when the track changes.
   *
   * Memoized because two effects depend on them, and an object rebuilt every
   * render would have both firing every render — one of them a network write.
   */
  const info = useMemo<StreamInfo>(
    () => ({
      width: videoTrack?.size?.width ?? null,
      height: videoTrack?.size?.height ?? null,
      frameRate: videoTrack?.frameRate ?? null,
      // What the stream declares, in preference order: average describes the
      // rendition, peak stands in when only it is stated. Never a measurement
      // of this viewing — see the table this ends up in.
      bandwidth: videoTrack?.averageBitrate ?? videoTrack?.peakBitrate ?? null,
    }),
    [videoTrack],
  )

  useEffect(() => {
    onStreamInfo?.(info)
  }, [onStreamInfo, info])

  /**
   * Written down, so the sources sheet can say what a stream is without
   * opening it.
   *
   * Only what the stream states about itself, and only once it has stated it —
   * a track arrives a segment or two in, which is why this hangs off the
   * figures rather than being read at the first frame.
   */
  const { mutate: recordStreamInfo } = useRecordStreamInfo()

  /**
   * The best the stream has offered, not the last thing it sent.
   *
   * An adaptive stream is several renditions and the player moves between them,
   * so the track changes whenever the network wobbles. Recording the latest
   * would be a write per switch for as long as somebody watched, and it would
   * also be the wrong figure: a portal's 1080p stream that dipped to 480p on a
   * bad minute is still a 1080p stream, and recording the dip would rank it
   * below a portal that only ever offered 720p.
   *
   * Taking the maximum makes each figure monotonic, so the writes are bounded
   * by the number of renditions the player climbs through rather than by how
   * long the channel is left on.
   */
  const bestRef = useRef<StreamInfo>(info)
  const sentRef = useRef("")

  /**
   * Read first, then report, and only where reporting adds something.
   *
   * The phone measures nothing -- it repeats what its video track declares --
   * so for most streams it arrives knowing strictly less than the table does.
   * Reporting anyway put a row on the wire whose only new information was the
   * time, and, worse, patched this client's own copy of the map with it: the
   * sheet then showed a resolution and nothing else for a stream the browser
   * had already measured a frame rate and a bitrate for.
   *
   * The stored reading is the starting point, so what goes out is the two
   * merged, and the write happens only when that differs from what was stored.
   * A phone that learns nothing new stays quiet, which is also what stops it
   * racing the fetch it is reading from.
   */
  useEffect(() => {
    if (savedChannelId == null || !storedInfoLoaded) return

    bestRef.current = bestStreamInfo(bestRef.current, info)
    const next = withNewReading(storedInfo, bestRef.current)
    if (!next.width && !next.height && !next.frameRate && !next.bandwidth) return

    // Compared against the stored row rather than against the last thing sent,
    // so a second viewing of an unchanged stream is silent rather than a repeat.
    const figures = (reading: Partial<StreamInfo> | undefined) =>
      JSON.stringify([
        reading?.width ?? null,
        reading?.height ?? null,
        reading?.frameRate ?? null,
        reading?.bandwidth ?? null,
      ])

    const payload = figures(next)
    if (payload === figures(storedInfo) || payload === sentRef.current) return
    sentRef.current = payload

    recordStreamInfo({ savedChannelId, ...next })
  }, [savedChannelId, storedInfoLoaded, info, storedInfo, recordStreamInfo])

  // A different channel is a different stream: the best seen so far belongs to
  // the one that just left.
  useEffect(() => {
    bestRef.current = {
      width: null,
      height: null,
      frameRate: null,
      bandwidth: null,
    }
    sentRef.current = ""
  }, [savedChannelId])

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

  /**
   * The controls fade rather than blink.
   *
   * They were mounted and unmounted, so they arrived and left in a single
   * frame — which reads as the screen glitching rather than as controls coming
   * and going. Kept mounted now and faded, with pointer events dropped at the
   * same time so an invisible bar cannot still take a tap.
   *
   * Slower out than in: showing them answers a tap and should feel immediate,
   * while hiding them happens on a timer nobody asked for, and a slow fade is
   * how that stays unobtrusive.
   */
  const controlsStyle = useAnimatedStyle(() => ({
    opacity: withTiming(controlsVisible ? 1 : 0, {
      duration: controlsVisible ? 140 : 260,
    }),
  }))

  const togglePlayback = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (player.playing) player.pause()
    else player.play()
    setControlsVisible(true)
  }, [player])

  /**
   * Fullscreen, ours rather than the platform's.
   *
   * VideoView.enterFullscreen hands the video to the system player, and its own
   * documentation is explicit about the two reasons that will not do here: the
   * native controls are forced back on whatever nativeControls says, and on
   * Android the JS runtime is paused for the duration — so React controls could
   * not run over it even in principle.
   *
   * Instead the same view simply grows. The screen hides its header and guide,
   * this container goes from a 16:9 box to filling what is left, and the
   * VideoView never unmounts — so playback continues rather than restarting
   * against a fresh buffer.
   */
  useEffect(() => {
    if (!fullscreen) return

    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    )

    // Back should leave fullscreen before it leaves the channel. Predictive
    // back may claim the gesture first on Android 13+, in which case the exit
    // button is still there.
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      onFullscreenChange(false)
      return true
    })

    return () => {
      back.remove()
      void ScreenOrientation.unlockAsync()
    }
  }, [fullscreen, onFullscreenChange])

  if (!canPlay) {
    return (
      <View className="my-3 aspect-video w-full items-center justify-center bg-black px-6">
        <Text className="font-sans text-center text-sm text-white/70">
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
    <View
      className={
        fullscreen
          ? "flex-1 bg-black"
          : // Edge to edge, with margin only above and below: a phone has little
            // enough width that giving twelve points of it away shows in the
            // picture. w-full rather than relying on a column parent stretching
            // its children, because the surface inside is a native view that
            // takes its size from this box and does not always agree about what
            // "stretch" meant a layout ago.
            //
            // Square, because the picture reaches both screen edges: a radius
            // there cuts a notch out of the video and leaves the page showing
            // through the corner, which is a frame around nothing.
            "my-3 aspect-video w-full overflow-hidden bg-black"
      }
    >
      {/* The system bars have no business over a full-screen picture, and the
          status bar is the one that overlaps it in landscape. */}
      {fullscreen ? <StatusBar hidden /> : null}
      {leaving ? null : (
        <VideoView
          ref={viewRef}
          player={player}
          // Measured against the box rather than flexed into it. A SurfaceView
          // is a native surface punched through the hierarchy, and flex: 1 left
          // it holding a width from a previous layout — the container went full
          // width and the picture stayed where it was, black down one side.
          style={{ width: "100%", height: "100%" }}
          // The whole point of this screen: our own controls over the video.
          // Native controls are forced back on in fullscreen by both platforms,
          // which is a limitation worth knowing rather than fighting.
          nativeControls={false}
          contentFit="contain"
          // The manifest flag that makes this possible on Android comes from the
          // expo-video config plugin, so it needs a build rather than a reload.
          allowsPictureInPicture
          // Leaves the frame-rate strategy at ExoPlayer's default. Matching the
          // display to the video is what removes judder from 24fps film and
          // 60fps sport, and the case for turning it off — keeping a feed's UI at
          // 120Hz — does not apply to a screen that is mostly video.
        />
      )}

      <Pressable
        onPress={toggleControls}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      >
        {failed ? (
          <View className="flex-1 items-center justify-center gap-3 px-6">
            {/* The player's own message, not just ours. A generic "try again"
                hid the one detail that mattered when release builds refused
                every plain-HTTP stream: Android names that failure exactly. */}
            <Text className="font-sans text-center text-sm text-white">
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

            <Animated.View
              style={[StyleSheet.absoluteFill, controlsStyle]}
              pointerEvents={controlsVisible ? "auto" : "none"}
            >
              {/* A scrim rather than a solid bar: the controls have to stay
                  legible over whatever frame happens to be behind them. */}
              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: "rgba(0,0,0,0.35)" },
                ]}
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

                {/* Only where the stream has any. A control that does nothing
                    is worse than an absent one, and most portals carry no
                    caption track at all. */}
                {availableSubtitleTracks.length ? (
                  <PressableScale
                    preset="icon"
                    hitSlop={8}
                    className="h-9 flex-row items-center justify-center gap-1.5 rounded-lg bg-black/50 px-2.5"
                    onPress={() => {
                      player.subtitleTrack = nextSubtitleTrack(
                        player.availableSubtitleTracks,
                        player.subtitleTrack,
                      )
                      tick()
                      setControlsVisible(true)
                    }}
                  >
                    {subtitleTrack ? (
                      <Captions size={18} color={iconPrimary} />
                    ) : (
                      <CaptionsOff size={18} color="#fff" />
                    )}
                    {/* Named only when there is a choice to be confused about.
                        One track needs no label; several do, or the second tap
                        is a guess. */}
                    {subtitleTrack && availableSubtitleTracks.length > 1 ? (
                      <Text
                        className="text-[11px] font-medium text-white"
                        style={{ includeFontPadding: false }}
                      >
                        {(subtitleTrack.language || subtitleTrack.label)
                          .slice(0, 3)
                          .toUpperCase()}
                      </Text>
                    ) : null}
                  </PressableScale>
                ) : null}

                <PressableScale
                  preset="icon"
                  hitSlop={8}
                  className="size-9 items-center justify-center rounded-lg bg-black/50"
                  onPress={() => void viewRef.current?.startPictureInPicture()}
                >
                  <PictureInPicture2 size={18} color="#fff" />
                </PressableScale>

                <PressableScale
                  preset="icon"
                  hitSlop={8}
                  className="size-9 items-center justify-center rounded-lg bg-black/50"
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    onFullscreenChange(!fullscreen)
                    setControlsVisible(true)
                  }}
                >
                  {fullscreen ? (
                    <Minimize size={18} color="#fff" />
                  ) : (
                    <Maximize size={18} color="#fff" />
                  )}
                </PressableScale>
              </View>
            </Animated.View>
          </View>
        )}
      </Pressable>
    </View>
  )
}
