"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircleIcon, RotateCcwIcon, RotateCwIcon } from "lucide-react"
import MuxVideo from "@mux/mux-video-react"
import { Hls, getCoreReference } from "@mux/playback-core"
import { useTheme } from "next-themes"

import { Badge } from "@/components/ui/badge"
import {
  MediaPlayer,
  MediaPlayerControls,
  MediaPlayerControlsOverlay,
  MediaPlayerError,
  MediaPlayerFullscreen,
  MediaPlayerLoading,
  MediaPlayerPiP,
  MediaPlayerPlay,
  MediaPlayerSeek,
  MediaPlayerSeekBackward,
  MediaPlayerSeekForward,
  MediaPlayerSettings,
  MediaPlayerTime,
  MediaPlayerVideo,
  MediaPlayerVolume,
  MediaPlayerVolumeIndicator,
} from "@/components/ui/media-player"
import { cn } from "@/lib/utils"
import { proxyImageUrl } from "@/lib/image-proxy"
import { TV_MOBILE_LAYOUT_QUERY } from "@/hooks/use-media-query"
import {
  canResolveChannel,
  formatBitrateLabel,
  formatFrameRateLabel,
  formatResolutionLabel,
  formatStreamVariant,
  getChannelKey,
  getChannelLogoUrl,
  resolveChannelLink,
  snapToCommonFrameRate,
  type CaptionCue,
  type PortalChannelWithSource,
  type StreamVariant,
} from "@/lib/tv-channels"
import { useTv } from "@/components/tv/tv-provider"
import { useChannelEpg } from "@/components/tv/channel-epg-provider"

// Past this much drift, treat the jump as a live-edge snap rather than playback drift.
const RESUME_JUMP_TOLERANCE = 1.5

// In-buffer seeks are frame-accurate; seeking outside the buffer refetches a fragment.
const isBuffered = (video: HTMLVideoElement, time: number) => {
  const { buffered } = video
  for (let i = 0; i < buffered.length; i += 1) {
    if (time >= buffered.start(i) && time <= buffered.end(i)) return true
  }
  return false
}

export function LivePlayer({ channel }: { channel: PortalChannelWithSource }) {
  const { resolvedTheme } = useTheme()
  const {
    endpoint,
    previewSourceRequest,
    useProxy,
    useImageProxy,
    epgChannels,
    customEpgChannels,
  } = useTv()
  const { currentProgramme } = useChannelEpg()

  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState("")
  const [playerElement, setPlayerElement] = useState<HTMLVideoElement | null>(
    null,
  )
  const captionCuesRef = useRef<Map<string, CaptionCue[]>>(new Map())
  const captionDebugStateRef = useRef("")
  const [activeCaption, setActiveCaption] = useState<string | null>(null)
  const [streamVariant, setStreamVariant] = useState<StreamVariant>({
    resolutionLabel: "",
    frameRateLabel: "",
    bitrateLabel: "",
  })

  const channelKey = getChannelKey(channel)
  const logoUrl = getChannelLogoUrl(
    channel,
    channel.portalSource,
    epgChannels,
    customEpgChannels,
    useImageProxy,
  )

  // Native media controls on Android and iPhone use this metadata for their
  // Now Playing surfaces. Programme art is more useful when present; the
  // channel logo remains a reliable fallback for sparse EPG sources.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return

    const artworkSource = currentProgramme?.posterUrl
      ? proxyImageUrl(currentProgramme.posterUrl, useImageProxy)
      : logoUrl
    let artwork: MediaImage[] | undefined
    if (artworkSource) {
      try {
        artwork = [
          {
            src: new URL(artworkSource, window.location.href).href,
            sizes: "512x512",
          },
        ]
      } catch {
        // A malformed provider logo should not prevent native controls.
      }
    }
    const title = currentProgramme?.title || channel.name || "Live stream"
    const artist = currentProgramme ? channel.name || "Live stream" : "Portal Hop"

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: channel.portalSource?.name || "Portal Hop",
      artwork,
    })

    const video = playerElement
    const updatePlaybackState = () => {
      navigator.mediaSession.playbackState = video?.paused ? "paused" : "playing"
    }
    const seekBy = (seconds: number) => {
      if (!video || video.seekable.length === 0) return
      const start = video.seekable.start(0)
      const end = video.seekable.end(video.seekable.length - 1)
      video.currentTime = Math.min(end, Math.max(start, video.currentTime + seconds))
    }
    const setActionHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // Some browsers expose MediaSession but omit individual actions.
      }
    }

    setActionHandler("play", () => void video?.play())
    setActionHandler("pause", () => video?.pause())
    setActionHandler("stop", () => video?.pause())
    setActionHandler("seekbackward", (details) =>
      seekBy(-(details.seekOffset ?? 10)),
    )
    setActionHandler("seekforward", (details) =>
      seekBy(details.seekOffset ?? 10),
    )

    video?.addEventListener("play", updatePlaybackState)
    video?.addEventListener("pause", updatePlaybackState)
    updatePlaybackState()

    return () => {
      video?.removeEventListener("play", updatePlaybackState)
      video?.removeEventListener("pause", updatePlaybackState)
      setActionHandler("play", null)
      setActionHandler("pause", null)
      setActionHandler("stop", null)
      setActionHandler("seekbackward", null)
      setActionHandler("seekforward", null)
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = "none"
    }
  }, [channel.name, channel.portalSource?.name, currentProgramme, logoUrl, playerElement, useImageProxy])

  // Resolve the latest playable stream for this channel. The component is keyed
  // by channel id upstream, so it remounts (fresh state) on channel change.
  useEffect(() => {
    if (!canResolveChannel(channel)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolveError("This channel can't be played.")
      return
    }

    const controller = new AbortController()

    resolveChannelLink(channel, {
      endpoint,
      portalRequest: previewSourceRequest,
      useProxy,
      signal: controller.signal,
    })
      .then((url) => {
        if (!controller.signal.aborted) setStreamUrl(url)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setResolveError(
          error instanceof Error
            ? error.message
            : "Could not pull the latest stream.",
        )
      })

    return () => {
      controller.abort()
    }
  }, [channel, endpoint, previewSourceRequest, useProxy])

  // hls.js snaps to the live edge once the playhead leaves the sliding playlist
  // window, so resuming skips ahead. Pull it back, but only while that frame is
  // still buffered — once it is evicted the live edge is the right answer.
  useEffect(() => {
    const video = playerElement
    if (!video) return

    let pausedAt: number | null = null
    let restoreTimers: ReturnType<typeof setTimeout>[] = []

    const clearRestoreTimers = () => {
      restoreTimers.forEach((timer) => clearTimeout(timer))
      restoreTimers = []
    }

    const onPause = () => {
      if (video.seeking || video.ended) return
      pausedAt = video.currentTime
    }

    const onSeeked = () => {
      if (video.paused && !video.ended) {
        pausedAt = video.currentTime
      }
    }

    const onPlay = () => {
      const target = pausedAt
      pausedAt = null
      if (target === null) return

      // The snap can land after play fires, so restore retries; seek only once.
      let settled = false

      const restore = () => {
        if (settled) return
        const seekable = video.seekable
        if (seekable.length === 0) return
        const start = seekable.start(0)
        const end = seekable.end(seekable.length - 1)
        if (target < start - 1) return
        const clamped = Math.min(target, end)
        if (video.currentTime <= clamped + RESUME_JUMP_TOLERANCE) return
        if (!isBuffered(video, clamped)) {
          settled = true
          return
        }
        video.currentTime = clamped
        settled = true
      }

      clearRestoreTimers()
      restore()
      restoreTimers = [80, 250, 500, 900].map((delay) =>
        setTimeout(restore, delay),
      )
    }

    video.addEventListener("pause", onPause)
    video.addEventListener("seeked", onSeeked)
    video.addEventListener("play", onPlay)

    return () => {
      clearRestoreTimers()
      video.removeEventListener("pause", onPause)
      video.removeEventListener("seeked", onSeeked)
      video.removeEventListener("play", onPlay)
    }
  }, [playerElement])

  // A phone in portrait wastes most of the screen on a 16:9 stream, so
  // fullscreen turns the handset sideways. Only phone-sized touch screens: on a
  // tablet or desktop the window is already big enough to be worth respecting.
  // iOS exposes no orientation lock at all — its native fullscreen player
  // follows the system rotation instead, so this quietly does nothing there.
  useEffect(() => {
    // lock() is missing from the DOM lib because Safari never shipped it.
    const orientation = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
      | undefined
    if (typeof orientation?.lock !== "function") return
    if (!window.matchMedia("(pointer: coarse)").matches) return
    if (!window.matchMedia(TV_MOBILE_LAYOUT_QUERY).matches) return

    const lockLandscape = orientation.lock

    const syncOrientation = () => {
      if (document.fullscreenElement) {
        // Rejects when the platform refuses the lock; the user can still rotate.
        lockLandscape.call(orientation, "landscape").catch(() => { })
      } else {
        orientation.unlock()
      }
    }

    document.addEventListener("fullscreenchange", syncOrientation)
    return () => {
      document.removeEventListener("fullscreenchange", syncOrientation)
      orientation.unlock()
    }
  }, [])

  // HLS engine hookup: stream-info badges (resolution/fps/bitrate) + embedded
  // CEA-608/708 caption decoding and overlay.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStreamVariant({
      resolutionLabel: "",
      frameRateLabel: "",
      bitrateLabel: "",
    })
    captionCuesRef.current.clear()
    captionDebugStateRef.current = ""
    setActiveCaption(null)

    if (!streamUrl || !playerElement) return

    let removeHlsListeners: (() => void) | undefined
    let intervalId: number | undefined
    let frameRateSampleIntervalId: number | undefined
    let hasManifestFrameRate = false
    let frameRateEstimated = false
    let lastFrameSample: { frames: number; time: number } | null = null
    const frameRateSamples: number[] = []

    const updateActiveCaption = () => {
      const selectedTrack = Array.from(
        playerElement.querySelectorAll("track"),
      ).find(
        (track) =>
          (track.track.kind === "captions" ||
            track.track.kind === "subtitles") &&
          track.track.mode === "showing",
      )

      if (!selectedTrack) {
        setActiveCaption(null)
        return
      }

      const cueTrackId = captionCuesRef.current.has(selectedTrack.id)
        ? selectedTrack.id
        : selectedTrack.id === "default" && captionCuesRef.current.size === 1
          ? [...captionCuesRef.current.keys()][0]
          : undefined
      const now = playerElement.currentTime
      const activeCues = (
        cueTrackId ? (captionCuesRef.current.get(cueTrackId) ?? []) : []
      ).filter((cue) => cue.startTime <= now && cue.endTime >= now)

      if (!activeCues.length) {
        setActiveCaption(null)
        return
      }

      const latestStartTime = Math.max(
        ...activeCues.map((cue) => cue.startTime),
      )
      const lines = activeCues
        .filter((cue) => Math.abs(cue.startTime - latestStartTime) < 0.05)
        .sort((a, b) => a.line - b.line)
        .map((cue) => cue.text)
        .filter((text, index, values) => text && values.indexOf(text) === index)

      setActiveCaption(lines.length ? lines.join("\n") : null)
    }

    const sampleFrameRate = () => {
      if (hasManifestFrameRate || frameRateEstimated) return

      if (
        playerElement.paused ||
        playerElement.seeking ||
        playerElement.playbackRate !== 1
      ) {
        lastFrameSample = null
        return
      }

      const quality = playerElement.getVideoPlaybackQuality()
      const now = performance.now()

      if (lastFrameSample) {
        const frameDelta = quality.totalVideoFrames - lastFrameSample.frames
        const timeDelta = (now - lastFrameSample.time) / 1000
        if (frameDelta > 0 && timeDelta > 0) {
          frameRateSamples.push(frameDelta / timeDelta)
        }
      }

      lastFrameSample = { frames: quality.totalVideoFrames, time: now }

      const stableSamples = frameRateSamples.slice(2)

      if (stableSamples.length >= 5) {
        const sorted = [...stableSamples].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        const snapped = snapToCommonFrameRate(median)

        frameRateEstimated = true
        setStreamVariant((current) =>
          current.frameRateLabel
            ? current
            : { ...current, frameRateLabel: formatFrameRateLabel(snapped) },
        )
      }
    }

    if (typeof playerElement.getVideoPlaybackQuality === "function") {
      frameRateSampleIntervalId = window.setInterval(sampleFrameRate, 1000)
    }

    const updateFromNativeVideo = () => {
      setStreamVariant((current) => {
        if (current.resolutionLabel || !playerElement.videoHeight) {
          return current
        }
        return {
          resolutionLabel: formatResolutionLabel({
            width: playerElement.videoWidth,
            height: playerElement.videoHeight,
          }),
          frameRateLabel: "",
          bitrateLabel: "",
        }
      })
    }

    const connectToHls = () => {
      const hls = getCoreReference(playerElement)?.engine
      if (!hls) return false

      const getActiveLevel = (levelIndex?: number) => {
        const levelIndexes = [
          levelIndex,
          hls.currentLevel,
          hls.loadLevel,
          hls.nextLoadLevel,
        ]
        for (const index of levelIndexes) {
          if (typeof index === "number" && index >= 0 && hls.levels[index]) {
            return hls.levels[index]
          }
        }
      }

      const updateBitrate = (bitrate?: number) => {
        if (!bitrate) return
        const bitrateLabel = formatBitrateLabel(bitrate)
        setStreamVariant((current) =>
          current.bitrateLabel === bitrateLabel
            ? current
            : { ...current, bitrateLabel },
        )
      }

      const updateFromLevel = (levelIndex?: number) => {
        const level = getActiveLevel(levelIndex)
        if (level) {
          const next = formatStreamVariant(level)
          if (next.frameRateLabel) {
            hasManifestFrameRate = true
          }
          setStreamVariant((current) => ({
            resolutionLabel: next.resolutionLabel || current.resolutionLabel,
            frameRateLabel: next.frameRateLabel || current.frameRateLabel,
            bitrateLabel: current.bitrateLabel,
          }))
        }
      }

      const allowEmbeddedCaptions = () => {
        for (const level of hls.levels) {
          if (level.attrs["CLOSED-CAPTIONS"] === "NONE") {
            delete level.attrs["CLOSED-CAPTIONS"]
          }
        }
      }

      const handleManifestParsed = () => {
        allowEmbeddedCaptions()
        updateFromLevel()
      }
      const handleCuesParsed = (
        _event: typeof Hls.Events.CUES_PARSED,
        data: { type: string; track: string; cues: VTTCue[] },
      ) => {
        if (data.type !== "captions") return

        const existing = captionCuesRef.current.get(data.track) ?? []
        const next = [...existing]

        for (const cue of data.cues) {
          const text = cue.text.replace(/<[^>]+>/g, "").trim()
          if (!text) continue

          const captionCue: CaptionCue = {
            startTime: cue.startTime,
            endTime: cue.endTime,
            line: typeof cue.line === "number" ? cue.line : 0,
            text,
          }
          const alreadyKnown = next.some(
            (existingCue) =>
              existingCue.startTime === captionCue.startTime &&
              existingCue.endTime === captionCue.endTime &&
              existingCue.line === captionCue.line &&
              existingCue.text === captionCue.text,
          )
          if (!alreadyKnown) next.push(captionCue)
        }

        captionCuesRef.current.set(
          data.track,
          next
            .filter((cue) => cue.endTime >= playerElement.currentTime - 5)
            .slice(-300),
        )
        updateActiveCaption()
      }
      const handleLevelSwitching = (
        _event: typeof Hls.Events.LEVEL_SWITCHING,
        data: { level: number },
      ) => updateFromLevel(data.level)
      const handleLevelSwitched = (
        _event: typeof Hls.Events.LEVEL_SWITCHED,
        data: { level: number },
      ) => updateFromLevel(data.level)
      const handleFragBuffered = (
        _event: typeof Hls.Events.FRAG_BUFFERED,
        data: {
          frag: { duration: number; level: number }
          stats: { loaded: number }
        },
      ) => {
        const calculatedBitrate =
          data.stats.loaded > 0 && data.frag.duration > 0
            ? (data.stats.loaded * 8) / data.frag.duration
            : undefined
        updateBitrate(calculatedBitrate)
        updateFromLevel(data.frag.level)
      }

      hls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed)
      hls.on(Hls.Events.CUES_PARSED, handleCuesParsed)
      hls.on(Hls.Events.LEVEL_SWITCHING, handleLevelSwitching)
      hls.on(Hls.Events.LEVEL_SWITCHED, handleLevelSwitched)
      hls.on(Hls.Events.FRAG_BUFFERED, handleFragBuffered)
      allowEmbeddedCaptions()
      updateFromLevel()

      removeHlsListeners = () => {
        hls.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed)
        hls.off(Hls.Events.CUES_PARSED, handleCuesParsed)
        hls.off(Hls.Events.LEVEL_SWITCHING, handleLevelSwitching)
        hls.off(Hls.Events.LEVEL_SWITCHED, handleLevelSwitched)
        hls.off(Hls.Events.FRAG_BUFFERED, handleFragBuffered)
      }

      return true
    }

    if (!connectToHls()) {
      intervalId = window.setInterval(() => {
        if (connectToHls() && intervalId) {
          window.clearInterval(intervalId)
          intervalId = undefined
        }
      }, 100)
    }

    playerElement.addEventListener("loadedmetadata", updateFromNativeVideo)
    playerElement.addEventListener("timeupdate", updateActiveCaption)
    playerElement.textTracks.addEventListener("change", updateActiveCaption)
    playerElement.textTracks.addEventListener("addtrack", updateActiveCaption)
    updateFromNativeVideo()
    updateActiveCaption()

    return () => {
      if (intervalId) window.clearInterval(intervalId)
      if (frameRateSampleIntervalId) {
        window.clearInterval(frameRateSampleIntervalId)
      }
      playerElement.removeEventListener("loadedmetadata", updateFromNativeVideo)
      playerElement.removeEventListener("timeupdate", updateActiveCaption)
      playerElement.textTracks.removeEventListener(
        "change",
        updateActiveCaption,
      )
      playerElement.textTracks.removeEventListener(
        "addtrack",
        updateActiveCaption,
      )
      removeHlsListeners?.()
    }
  }, [playerElement, streamUrl])

  if (resolveError) {
    return (
      <div className="border-destructive/40 bg-destructive/10 text-destructive flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border p-4 text-center text-sm">
        <AlertCircleIcon className="size-6" />
        {resolveError}
      </div>
    )
  }

  if (!streamUrl) {
    return (
      <div className="aspect-video w-full rounded-lg bg-black" />
    )
  }

  return (
    <MediaPlayer
      key={`${channelKey}-${streamUrl}`}
      autoHide
      className="group/player aspect-video w-full overflow-hidden rounded-lg bg-black"
    >
      <MediaPlayerVideo
        render={
          <MuxVideo
            ref={(element) => setPlayerElement(element ?? null)}
            src={streamUrl}
            type="hls"
            streamType="live"
            preferPlayback="mse"
            _hlsConfig={{
              enableCEA708Captions: true,
              renderTextTracksNatively: false,
              liveSyncMode: "buffered",
              liveSyncDurationCount: 3,
              liveMaxLatencyDurationCount: 600,
              maxLiveSyncPlaybackRate: 1,
              backBufferLength: 90,
            }}
            preload="auto"
            targetLiveWindow={30}
            autoPlay
            playsInline
            envKey={process.env.NEXT_PUBLIC_MUX_ENV_KEY}
            metadata={{
              video_id: channelKey,
              video_title: channel.name || "Live stream",
              video_stream_type: "live",
            }}
            className="h-full w-full bg-black object-contain"
          />
        }
      />
      {activeCaption ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[5%] z-20 flex justify-center px-8">
          <p
            className={cn(
              "max-w-[85%] rounded-xl px-4 py-2 text-center text-[clamp(0.875rem,1.4vw,1.125rem)] leading-tight font-medium whitespace-pre-line shadow-xl backdrop-blur-md group-data-[state=fullscreen]/player:text-[clamp(1rem,2.2vw,1.875rem)]",
              resolvedTheme === "dark"
                ? "bg-black/70 text-white"
                : "bg-white/70 text-black",
            )}
          >
            {activeCaption}
          </p>
        </div>
      ) : null}
      <MediaPlayerLoading />
      <MediaPlayerError />
      <MediaPlayerVolumeIndicator />
      <MediaPlayerControls className="flex-col items-start gap-2.5 px-4 pb-3">
        <MediaPlayerControlsOverlay />
        <div className="flex w-full items-center gap-3 pb-1">
          {logoUrl ? (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-zinc-950/50 p-1 shadow-inner backdrop-blur">
              {/* eslint-disable-next-line @next/next/no-img-element -- Channel logos can come from arbitrary provider or EPG hosts. */}
              <img
                src={logoUrl}
                alt=""
                className="size-full rounded-[6px] object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-lg font-semibold text-white">
              {channel.name || "Live stream"}
            </h2>
            <div className="flex min-w-0 items-center gap-2 text-sm text-white/60">
              {channel.genre ? (
                <span className="truncate font-medium">{channel.genre}</span>
              ) : null}
              {channel.portalSource?.name ? (
                <Badge
                  variant="outline"
                  className="h-5 bg-white/10 text-white backdrop-blur"
                >
                  {channel.portalSource.name}
                </Badge>
              ) : null}
              <StreamInfoBadges
                variant={streamVariant}
                className="bg-white/10 text-white backdrop-blur"
              />
            </div>
          </div>
        </div>
        <MediaPlayerSeek />
        <div className="flex w-full items-center gap-2">
          <div className="flex flex-1 items-center gap-2">
            <MediaPlayerPlay />
            <MediaPlayerSeekBackward>
              <RotateCcwIcon />
            </MediaPlayerSeekBackward>
            <MediaPlayerSeekForward>
              <RotateCwIcon />
            </MediaPlayerSeekForward>
            <MediaPlayerTime />
          </div>
          <div className="flex items-center gap-2">
            <MediaPlayerVolume expandable />
            <MediaPlayerSettings />
            <MediaPlayerPiP className="max-[939px]:hidden" />
            <MediaPlayerFullscreen />
          </div>
        </div>
      </MediaPlayerControls>
    </MediaPlayer>
  )
}

function StreamInfoBadges({
  variant,
  className,
}: {
  variant: StreamVariant
  className?: string
}) {
  const label = [variant.resolutionLabel, variant.frameRateLabel]
    .filter(Boolean)
    .join(" • ")
  const labelWithBitrate = variant.bitrateLabel
    ? [label, variant.bitrateLabel].filter(Boolean).join(" @ ")
    : label

  if (!labelWithBitrate) return null

  return (
    <Badge
      variant="outline"
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 h-5 duration-300 ease-out",
        className,
      )}
    >
      {labelWithBitrate}
    </Badge>
  )
}
