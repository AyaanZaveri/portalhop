"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircleIcon, RotateCcwIcon, RotateCwIcon } from "lucide-react"
import MuxVideo from "@mux/mux-video-react"
import { Hls, getCoreReference } from "@mux/playback-core"

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

export function LivePlayer({ channel }: { channel: PortalChannelWithSource }) {
  const {
    endpoint,
    previewSourceRequest,
    useProxy,
    useImageProxy,
    epgChannels,
    customEpgChannels,
  } = useTv()

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

  // Live streams snap to the live edge when playback resumes, so pausing and
  // hitting play skips past whatever you paused over. Remember the paused
  // position and pull it back if the player jumps forward, within the DVR window.
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

      const restore = () => {
        const seekable = video.seekable
        if (seekable.length === 0) return
        const start = seekable.start(0)
        const end = seekable.end(seekable.length - 1)
        if (target < start - 1) return
        const clamped = Math.min(target, end)
        if (video.currentTime > clamped + 1.5) {
          video.currentTime = clamped
        }
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
          <p className="max-w-[85%] rounded-xl bg-black/70 px-4 py-2 text-center text-[clamp(0.875rem,1.4vw,1.125rem)] leading-tight font-medium whitespace-pre-line text-white shadow-xl backdrop-blur-md group-data-[state=fullscreen]/player:text-[clamp(1rem,2.2vw,1.875rem)]">
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
            <MediaPlayerPiP />
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
