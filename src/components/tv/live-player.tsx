"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircleIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  RotateCwIcon,
} from "lucide-react"
import { Hls } from "@mux/playback-core"
import { useTheme } from "next-themes"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  MediaPlayer,
  MediaPlayerCast,
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
import { proxyImageUrl } from "@portalhop/shared/image-proxy"
import { TV_MOBILE_LAYOUT_QUERY } from "@/hooks/use-media-query"
import {
  canResolveChannel,
  formatBitrateLabel,
  formatFrameRateLabel,
  formatResolutionLabel,
  formatStreamVariant,
  getChannelKey,
  getChannelLogoUrl,
  getExternalPlayerUrl,
  isStreamProxyConfigured,
  resolveChannelLink,
  snapToCommonFrameRate,
  type CaptionCue,
  type PortalChannelWithSource,
  type StreamVariant,
} from "@/lib/tv-channels"
import { ChannelLogo } from "@/components/tv/channel-logo"
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

/**
 * How long a stream gets to produce a frame before it counts as dead.
 *
 * Timed from the moment the link resolves, not from the tap: pulling a fresh
 * link out of a Stalker portal is its own wait, and a portal that is slow to
 * answer is not the same thing as a stream that will never play.
 *
 * Eight seconds rather than five. A live HLS stream on a distant portal
 * genuinely takes three or four to fetch a playlist, pull the first segments
 * and fill enough buffer to start, and cutting away from one that was about to
 * work is worse than waiting a moment longer -- the viewer has already chosen
 * this source, and the next one has its own several seconds to spend.
 */
const START_DEADLINE_MS = 8000
const FAILOVER_DELAY_SECONDS = 3

type HlsCaptionTrack = {
  id: string
  cueTrackId: string
  label: string
  kind: "captions" | "subtitles"
  subtitleTrackId?: number
}

type NonNativeHlsTextTrack = {
  _id?: string
  label: string
  kind: string
  default: boolean
  subtitleTrack?: { id: number; lang?: string }
  closedCaptions?: { lang?: string }
}

type HdrLevel = {
  videoRange: "SDR" | "PQ" | "HLG"
  videoCodec?: string
  width: number
  height: number
  bitrate: number
  frameRate: number
}

/**
 * The HLS manifest is the normal source for this, but many IPTV playlists
 * omit VIDEO-RANGE while retaining HDR metadata in the decoded HEVC frame.
 * VideoFrame exposes that frame metadata when supported, making it the more
 * authoritative signal for those streams.
 */
function getDecodedHdrTransfer(video: HTMLVideoElement) {
  if (
    typeof VideoFrame === "undefined" ||
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return null
  }

  let frame: VideoFrame | undefined
  try {
    frame = new VideoFrame(video)
    // TypeScript's DOM declarations have not yet caught up with the WebCodecs
    // `pq` and `hlg` transfer values that current Chromium exposes.
    const transfer = frame.colorSpace.transfer as string | null
    return transfer === "pq" || transfer === "hlg" ? transfer : null
  } catch {
    return null
  } finally {
    frame?.close()
  }
}

async function isConfirmedHdrPlayback(
  level: HdrLevel | undefined,
  video: HTMLVideoElement,
) {
  const decodedTransfer = getDecodedHdrTransfer(video)
  const transfer =
    decodedTransfer ??
    (level?.videoRange === "PQ" || level?.videoRange === "HLG"
      ? level.videoRange.toLowerCase()
      : null)

  if (!transfer || !window.matchMedia("(dynamic-range: high)").matches) {
    return false
  }

  // A presented frame already proves this browser can decode the exact stream.
  // This also handles single media playlists, whose hls.js level has no codec
  // or VIDEO-RANGE metadata to send through Media Capabilities.
  if (decodedTransfer) return true

  if (!level?.videoCodec) return false

  const mediaCapabilities = navigator.mediaCapabilities
  if (!mediaCapabilities?.decodingInfo) return false

  try {
    const result = await mediaCapabilities.decodingInfo({
      type: "media-source",
      video: {
        contentType: `video/mp4; codecs="${level.videoCodec.split(",")[0]}"`,
        width: level.width || 640,
        height: level.height || 480,
        bitrate: level.bitrate,
        framerate: level.frameRate || 30,
        transferFunction: transfer as TransferFunction,
      },
    })
    return result.supported
  } catch {
    return false
  }
}

export function LivePlayer({
  channel,
  logoUrl: channelLogoUrl,
  onUnplayable,
  hasNextSource = false,
  onChooseSource,
}: {
  channel: PortalChannelWithSource
  /**
   * The channel's logo, not this stream's.
   *
   * Passed in because the two differ once a source is picked: `channel` here is
   * one portal's copy, carrying whatever artwork that portal shipped, and the
   * player is showing the channel. Which portal is supplying the pixels belongs
   * in the sources drawer, where every row wears its own.
   */
  logoUrl?: string
  /**
   * Called once when this stream turns out not to play: the link would not
   * resolve, or it resolved and nothing arrived before the deadline.
   *
   * The player says what happened and does not decide what to do about it.
   * Which stream comes next is a fact about the channel, which this component
   * does not know -- it has been handed one stream.
   */
  onUnplayable?: (reason: string) => void
  /** Whether the channel has another saved stream to try after a failure. */
  hasNextSource?: boolean
  /** Opens the source chooser without committing to a fallback. */
  onChooseSource?: () => void
}) {
  const { resolvedTheme } = useTheme()
  const {
    endpoint,
    previewSourceRequest,
    useImageProxy,
    epgChannels,
    customEpgChannels,
    recordStreamInfo,
  } = useTv()

  // Held in a ref rather than in the player effect's dependencies: the effect
  // tears down and rebuilds the HLS engine, which is not something a callback
  // identity should be able to cause.
  const recordStreamRef = useRef(recordStreamInfo)
  useEffect(() => {
    recordStreamRef.current = recordStreamInfo
  }, [recordStreamInfo])
  const { currentProgramme } = useChannelEpg()

  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState("")
  const [fallbackSeconds, setFallbackSeconds] = useState<number | null>(null)
  const [fallbackCancelled, setFallbackCancelled] = useState(false)
  const [playerElement, setPlayerElement] = useState<HTMLVideoElement | null>(
    null,
  )
  // The player owns hls.js directly. Metrics attach to this exact instance;
  // getCoreReference only works for Mux-managed playback and therefore became
  // empty when the transport moved to the direct HLS.js hookup below.
  const hlsRef = useRef<Hls | null>(null)
  const selectedCaptionTrackRef = useRef<HlsCaptionTrack | null>(null)
  const [captionTracks, setCaptionTracks] = useState<HlsCaptionTrack[]>([])
  const [captionTracksLoading, setCaptionTracksLoading] = useState(true)
  const [selectedCaptionTrack, setSelectedCaptionTrack] =
    useState<HlsCaptionTrack | null>(null)

  const registerCaptionTracks = useCallback(
    (tracks: NonNativeHlsTextTrack[]) => {
      const found = tracks
        .filter(
          (track) => track.kind === "captions" || track.kind === "subtitles",
        )
        .map((track): HlsCaptionTrack => {
          const subtitleTrackId = track.subtitleTrack?.id
          const id = track._id ?? `subtitle:${subtitleTrackId}`
          return {
            id,
            cueTrackId:
              subtitleTrackId == null
                ? id
                : track.default
                  ? "default"
                  : `subtitles${subtitleTrackId}`,
            label: track.label || "Captions",
            kind: track.kind as "captions" | "subtitles",
            subtitleTrackId,
          }
        })

      if (!found.length) return
      setCaptionTracksLoading(false)
      setCaptionTracks((current) => {
        const next = new Map(current.map((track) => [track.id, track]))
        for (const track of found) next.set(track.id, track)
        return [...next.values()]
      })
    },
    [],
  )
  // Attach hls.js directly to our normal video element. Mux and Video.js both
  // add a layer around this API; their elements/wrappers complicate layout.
  // This keeps PortalHop's controls on one <video> and handles AVC and HEVC
  // transport streams through Chrome's MediaSource implementation.
  useEffect(() => {
    if (!playerElement || !streamUrl) return

    // This belongs to the HLS session, not the later metrics effect. Caption
    // discovery can occur before that effect runs, so clearing it there was
    // erasing tracks which the bridge had just registered.
    selectedCaptionTrackRef.current = null
    setCaptionTracks([])
    setCaptionTracksLoading(true)
    setSelectedCaptionTrack(null)

    if (!Hls.isSupported()) {
      // eslint-disable-next-line react-hooks/immutability
      playerElement.src = streamUrl
      void playerElement.play().catch(() => {})
      return () => {
        playerElement.removeAttribute("src")
        playerElement.load()
      }
    }

    const hls = new Hls({
      enableCEA708Captions: true,
      // PortalHop renders caption cues in its own overlay rather than using
      // browser text-track styling.
      renderTextTracksNatively: false,
      liveSyncMode: "buffered",
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 600,
      maxLiveSyncPlaybackRate: 1,
      backBufferLength: 90,
    })

    hlsRef.current = hls
    // Mux Video installed this bridge internally. Direct hls.js does not, so
    // recreate only that behavior: record the source track and keep its DOM
    // TextTrack disabled. PortalHop renders its cues in the custom overlay.
    const bridgeTextTracks = (
      _event: typeof Hls.Events.NON_NATIVE_TEXT_TRACKS_FOUND,
      data: { tracks: NonNativeHlsTextTrack[] },
    ) => {
      registerCaptionTracks(data.tracks)
      for (const track of data.tracks) {
        if (track.kind !== "captions" && track.kind !== "subtitles") continue
        const subtitleTrackId = track.subtitleTrack?.id
        const id =
          track._id ??
          (subtitleTrackId == null
            ? undefined
            : track.default
              ? "default"
              : `subtitles${subtitleTrackId}`)
        if (!id || playerElement.textTracks.getTrackById(id)) continue

        const element = document.createElement("track")
        element.id = id
        element.kind = track.kind as TextTrackKind
        element.label = track.label || "Captions"
        const language = track.subtitleTrack?.lang ?? track.closedCaptions?.lang
        if (language) element.srclang = language
        element.track.mode = "disabled"
        element.setAttribute("data-removeondestroy", "")
        playerElement.append(element)
      }
    }

    hls.on(Hls.Events.NON_NATIVE_TEXT_TRACKS_FOUND, bridgeTextTracks)
    hls.loadSource(streamUrl)
    hls.attachMedia(playerElement)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      // Never force muted playback. If an asynchronous autoplay attempt is
      // blocked, PortalHop's normal play control remains available.
      void playerElement.play().catch(() => {})
    })

    return () => {
      if (hlsRef.current === hls) hlsRef.current = null
      hls.off(Hls.Events.NON_NATIVE_TEXT_TRACKS_FOUND, bridgeTextTracks)
      hls.destroy()
    }
  }, [playerElement, registerCaptionTracks, streamUrl])
  /**
   * What has been learned about the stream so far, and what was last sent.
   *
   * Two sources feed this and they arrive at different times. The manifest
   * declares what it declares the moment a level resolves; everything it omits
   * the player works out for itself over the next few seconds — fragments
   * weighed for a bitrate, frames counted for a rate. A single report at the
   * first level would store the first half and throw away the second, which is
   * most of what is known about a raw MPEG-TS stream.
   *
   * So it reports again as figures arrive, and the signature is what stops that
   * being a write per level switch on an adaptive stream.
   */
  const learnedRef = useRef<Record<string, number | boolean | null>>({})
  const reportedRef = useRef("")
  const captionCuesRef = useRef<Map<string, CaptionCue[]>>(new Map())
  const captionDebugStateRef = useRef("")
  const [activeCaption, setActiveCaption] = useState<string | null>(null)
  const [streamVariant, setStreamVariant] = useState<StreamVariant>({
    resolutionLabel: "",
    frameRateLabel: "",
    bitrateLabel: "",
  })
  const [isHdrPlaying, setIsHdrPlaying] = useState(false)

  const selectCaptionTrack = useCallback((track: HlsCaptionTrack | null) => {
    selectedCaptionTrackRef.current = track
    setSelectedCaptionTrack(track)
    setActiveCaption(null)

    const hls = hlsRef.current
    if (!hls) return

    // External WebVTT subtitles must be selected at hls.js as well as in our
    // overlay. CEA tracks are decoded together, so their selection only needs
    // to choose which parsed cue stream PortalHop draws.
    hls.subtitleTrack = track?.subtitleTrackId ?? -1
  }, [])

  const failStream = useCallback((reason: string) => {
    setResolveError(reason)
    setFallbackSeconds(FAILOVER_DELAY_SECONDS)
    setFallbackCancelled(false)
  }, [])

  const channelKey = getChannelKey(channel)
  // Falls back to this stream's own, which is all there is when the player is
  // rendered outside a channel view.
  const logoUrl =
    channelLogoUrl ||
    getChannelLogoUrl(
      channel,
      channel.portalSource,
      epgChannels,
      customEpgChannels,
      useImageProxy,
    )

  // The receiver fetches this itself, from its own place on the network, so a
  // path relative to this page would resolve against the wrong host.
  const castArtworkUrl = currentProgramme?.posterUrl
    ? proxyImageUrl(currentProgramme.posterUrl, useImageProxy)
    : logoUrl
  const castPosterUrl = useMemo(() => {
    if (!castArtworkUrl || typeof window === "undefined") return undefined
    try {
      return new URL(castArtworkUrl, window.location.href).href
    } catch {
      return undefined
    }
  }, [castArtworkUrl])

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
    const artist = currentProgramme
      ? channel.name || "Live stream"
      : "Portal Hop"

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: channel.portalSource?.name || "Portal Hop",
      artwork,
    })

    const video = playerElement
    const updatePlaybackState = () => {
      navigator.mediaSession.playbackState = video?.paused
        ? "paused"
        : "playing"
    }
    const seekBy = (seconds: number) => {
      if (!video || video.seekable.length === 0) return
      const start = video.seekable.start(0)
      const end = video.seekable.end(video.seekable.length - 1)
      video.currentTime = Math.min(
        end,
        Math.max(start, video.currentTime + seconds),
      )
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
  }, [
    channel.name,
    channel.portalSource?.name,
    currentProgramme,
    logoUrl,
    playerElement,
    useImageProxy,
  ])

  // Resolve the latest playable stream for this channel. The component is keyed
  // by the specific stream upstream, so choosing another source remounts it
  // with fresh loading and error state.
  useEffect(() => {
    if (!canResolveChannel(channel)) {
      // This is a synchronous input validation failure, not an async player
      // event; rendering its recovery surface is the effect's purpose.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      failStream("This channel can't be played.")
      return
    }

    const controller = new AbortController()

    resolveChannelLink(channel, {
      endpoint,
      portalRequest: previewSourceRequest,
      // The proxy normalizes the HLS delivery path and is consistently faster
      // for this deployment. If it is not configured, resolveChannelLink
      // safely falls back to the original direct URL.
      useProxy: isStreamProxyConfigured(),
      signal: controller.signal,
    })
      .then((url) => {
        if (controller.signal.aborted) return
        setResolveError("")
        setFallbackSeconds(null)
        setFallbackCancelled(false)
        setStreamUrl(url)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        failStream(
          error instanceof Error
            ? error.message
            : "Could not pull the latest stream.",
        )
      })

    return () => {
      controller.abort()
    }
  }, [channel, endpoint, failStream, previewSourceRequest])

  /**
   * The deadline, and the two ways it is cancelled.
   *
   * A stream that cannot be resolved is dead immediately -- there is nothing to
   * wait for -- so that reports at once. A stream that resolved gets until the
   * deadline to put a frame on screen, and the first `playing` event calls the
   * whole thing off.
   *
   * `timeupdate` is deliberately not the signal. It fires while the playhead is
   * at zero on some browsers, which would call a dead stream alive.
   */
  /**
   * Held in a ref, and written to from an effect rather than during render.
   *
   * The caller rebuilds this function every render — it sits below an early
   * return, so it cannot be memoized — and putting it in the deadline's
   * dependencies would restart the countdown on every render, which is a
   * countdown that never reaches the end.
   */
  const reportUnplayable = useRef(onUnplayable)

  useEffect(() => {
    reportUnplayable.current = onUnplayable
  }, [onUnplayable])

  useEffect(() => {
    if (!resolveError || !hasNextSource || fallbackCancelled) return

    const deadline = Date.now() + FAILOVER_DELAY_SECONDS * 1000
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setFallbackSeconds(remaining)
      if (remaining !== 0) return
      setFallbackCancelled(true)
      reportUnplayable.current?.(resolveError)
    }
    tick()
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [fallbackCancelled, hasNextSource, resolveError])

  useEffect(() => {
    const video = playerElement
    if (!streamUrl || !video) return

    // Already running when this mounted -- a source switch reuses the element
    // for a moment -- so there is nothing to wait for.
    if (!video.paused && video.currentTime > 0) return

    const started = () => window.clearTimeout(timer)
    const timer = window.setTimeout(() => {
      failStream("This source did not start.")
    }, START_DEADLINE_MS)

    video.addEventListener("playing", started)
    const failed = () => {
      // With MSE playback, hls.js provides the useful distinction between a
      // recoverable decoder fault and an exhausted request. Let its handler
      // make that call. Native HLS has no engine, so it fails here.
      if (hlsRef.current) return
      failStream("This source could not be played.")
    }
    video.addEventListener("error", failed)

    return () => {
      window.clearTimeout(timer)
      video.removeEventListener("playing", started)
      video.removeEventListener("error", failed)
    }
  }, [failStream, playerElement, streamUrl])

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
        lockLandscape.call(orientation, "landscape").catch(() => {})
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsHdrPlaying(false)
    learnedRef.current = {}
    reportedRef.current = ""
    captionCuesRef.current.clear()
    captionDebugStateRef.current = ""
    setActiveCaption(null)

    if (!streamUrl || !playerElement) return

    let removeHlsListeners: (() => void) | undefined
    let intervalId: number | undefined
    let frameRateSampleIntervalId: number | undefined
    let hasManifestFrameRate = false
    let frameRateEstimated = false
    let lastHdrLevel: HdrLevel | undefined
    let hdrCheckId = 0
    let hdrFrameCallbackId: number | undefined
    let lastFrameSample: { frames: number; time: number } | null = null
    const frameRateSamples: number[] = []

    const updateActiveCaption = () => {
      const selectedTrack = selectedCaptionTrackRef.current
      if (!selectedTrack) {
        setActiveCaption(null)
        return
      }

      const now = playerElement.currentTime
      const activeCues = (
        captionCuesRef.current.get(selectedTrack.cueTrackId) ?? []
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

    /**
     * Records what is known, once it is worth recording.
     *
     * Declared figures win over measured ones for the same field — a manifest's
     * FRAME-RATE is a property of the rendition, where a count over five
     * seconds is this player on this connection — so a measurement only fills a
     * gap, and says so when it does.
     */
    const reportStream = (
      learned: Partial<{
        width: number | null
        height: number | null
        frameRate: number | null
        bandwidth: number | null
        frameRateMeasured: boolean
        bandwidthMeasured: boolean
      }>,
    ) => {
      const savedChannelId = channel.savedChannelId
      if (typeof savedChannelId !== "number") return

      const measured = Boolean(
        learned.frameRateMeasured || learned.bandwidthMeasured,
      )

      for (const [field, value] of Object.entries(learned)) {
        if (value === null || value === undefined) continue

        // A measurement fills a gap and never overwrites. It replaces neither a
        // declared figure, which is the better answer, nor an earlier
        // measurement of its own, which is what keeps a bitrate that moves with
        // every fragment from being a write with every fragment.
        if (measured && learnedRef.current[field]) continue

        /**
         * Declared figures keep the best seen, rather than the latest.
         *
         * An adaptive stream is several renditions and the player moves between
         * them, so "latest" changes every time the network wobbles — and since
         * a write happens whenever the payload changes, latest meant a write
         * per switch, for as long as somebody watched.
         *
         * Best is also the truer answer to what the drawer asks. A portal's
         * 1080p stream that dipped to 480p on a bad minute is still a 1080p
         * stream; recording the dip would rank it below a portal that only ever
         * offered 720p. Taking the maximum makes the figure monotonic, which
         * bounds the writes to the number of renditions the player climbs
         * through -- three or four, once each.
         */
        const current = learnedRef.current[field]
        if (
          !measured &&
          typeof value === "number" &&
          typeof current === "number" &&
          value <= current
        ) {
          continue
        }

        learnedRef.current[field] = value
      }

      const payload = JSON.stringify({ savedChannelId, ...learnedRef.current })
      if (payload === reportedRef.current) return
      reportedRef.current = payload

      // Through the provider, so the sources drawer shows this without waiting
      // for a reload -- it reads the map once a session, and this is the stream
      // the viewer is watching right now.
      recordStreamRef.current(savedChannelId, {
        width: null,
        height: null,
        frameRate: null,
        bandwidth: null,
        ...learnedRef.current,
      })
    }

    /**
     * The stream's average bitrate, weighed over ten seconds of one rendition.
     *
     * Bytes over media duration rather than over wall-clock, so this is the
     * encoded rate of what arrived and not a reading of the connection: a slow
     * network delays a fragment, it does not shrink it. That is what makes the
     * figure worth storing at all -- it can be held against another portal's
     * copy of the same channel.
     *
     * Weighed rather than averaged across samples, because fragments differ in
     * length and a mean of per-fragment rates counts a two-second one as
     * heavily as a six. Over a window rather than instantaneously, because
     * per-fragment rates swing by a third on variable bitrate -- a still
     * scoreboard against a fast pan -- so one fragment describes a scene rather
     * than a stream.
     *
     * Per rendition, and reset when the player switches, because a player
     * starts low and climbs: an average taken across the ramp is an average of
     * two different streams. Ten seconds is the shortest window that spans a
     * few fragments at any common segment length.
     */
    let bandwidthLevel: number | null = null
    let bandwidthBytes = 0
    let bandwidthSeconds = 0
    let bandwidthReported = false

    const measureBandwidth = (
      level: number,
      loaded: number,
      duration: number,
    ) => {
      if (loaded <= 0 || duration <= 0) return

      if (level !== bandwidthLevel) {
        bandwidthLevel = level
        bandwidthBytes = 0
        bandwidthSeconds = 0
        bandwidthReported = false
      }

      bandwidthBytes += loaded
      bandwidthSeconds += duration

      if (bandwidthReported || bandwidthSeconds < 10) return

      bandwidthReported = true
      reportStream({
        bandwidth: Math.round((bandwidthBytes * 8) / bandwidthSeconds),
        bandwidthMeasured: true,
      })
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
        reportStream({ frameRate: snapped, frameRateMeasured: true })
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
      if (!playerElement.videoHeight) return

      /**
       * The decoded frame, which is the only place some streams say their size.
       *
       * This drew the badge and stopped there, so a stream whose manifest omits
       * RESOLUTION showed 1080p over the player and stored nothing -- the
       * drawer had a bitrate and a frame rate for it and no resolution, for a
       * figure that was on screen the whole time.
       *
       * No measured mark. A tilde says "this connection on this evening", which
       * is honest about a bitrate and wrong about this: the frame the decoder
       * produced is the size the portal sent, exactly, and does not vary with
       * the network. If anything it is the better witness of the two, since a
       * manifest can claim a resolution it does not deliver.
       */
      reportStream({
        width: playerElement.videoWidth || null,
        height: playerElement.videoHeight,
      })

      setStreamVariant((current) => {
        if (current.resolutionLabel) return current
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
      const hls = hlsRef.current
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

      const checkHdrPlayback = (level: HdrLevel, force = false) => {
        if (!force && level === lastHdrLevel) return
        lastHdrLevel = level
        const checkId = ++hdrCheckId
        void isConfirmedHdrPlayback(level, playerElement).then((confirmed) => {
          if (checkId === hdrCheckId) setIsHdrPlaying(confirmed)
        })
      }

      const scheduleHdrFrameCheck = () => {
        if (
          hdrFrameCallbackId !== undefined ||
          typeof playerElement.requestVideoFrameCallback !== "function"
        ) {
          return
        }

        hdrFrameCallbackId = playerElement.requestVideoFrameCallback(() => {
          hdrFrameCallbackId = undefined
          const level = getActiveLevel()
          if (level) checkHdrPlayback(level, true)
        })
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
          checkHdrPlayback(level)
          scheduleHdrFrameCheck()
          reportStream({
            width: level.width || null,
            height: level.height || null,
            frameRate: Number(level.attrs["FRAME-RATE"]) || null,
            // AVERAGE-BANDWIDTH, not BANDWIDTH. The latter is the peak a
            // rendition is allowed to reach and runs a third to double the
            // average, so storing it would put two different quantities in one
            // column: a channel somebody watched long enough to measure would
            // read lower than the same channel opened once, and the drawer
            // ranks those against each other. hls.js falls this getter back to
            // the peak where a manifest states no average, which is the same
            // order the phone asks its track for.
            bandwidth: level.averageBitrate || null,
          })

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
        if (data.type !== "captions" && data.type !== "subtitles") return

        // hls.js names a default WebVTT rendition "default". Keep it tied to
        // the PortalHop selection rather than letting it overwrite another
        // default-looking caption track.
        const cueTrackId =
          data.track === "default"
            ? (selectedCaptionTrackRef.current?.cueTrackId ?? data.track)
            : data.track

        const existing = captionCuesRef.current.get(cueTrackId) ?? []
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
          cueTrackId,
          next
            .filter((cue) => cue.endTime >= playerElement.currentTime - 5)
            .slice(-300),
        )
        updateActiveCaption()
      }
      let recoveredMediaError = false
      let bufferedMainFragments = 0
      const handleHlsError = (
        _event: typeof Hls.Events.ERROR,
        data: { fatal: boolean; details?: string; type?: string },
      ) => {
        /*
         * A few live MPEG-TS feeds signal AAC Main (mp4a.40.1) rather than a
         * browser-decodable AAC profile. hls.js can download and transmux the
         * fragments, so the controls look buffered, but MediaSource rejects
         * the audio SourceBuffer and video can never start. Do not leave that
         * state looking like an indefinitely-loading black frame: report it
         * immediately so the caller can try another source, and the existing
         * Open in player menu remains available for VLC/mpv.
         */
        if (
          data.fatal &&
          (data.details === "bufferAddCodecError" ||
            data.details === "bufferIncompatibleCodecsError")
        ) {
          failStream(
            "This stream's audio codec is not supported by this browser. Try another source or open it in VLC.",
          )
          return
        }

        // Non-fatal errors already use hls.js's own retry policies. Once an
        // error is fatal, give a decoder hiccup one recovery attempt; repeated
        // media errors and exhausted network retries move to the next source
        // instead of leaving the viewer on an endless spinner.
        if (!data.fatal) return
        if (data.type === "mediaError" && !recoveredMediaError) {
          recoveredMediaError = true
          hls.recoverMediaError()
          return
        }

        failStream(
          data.type === "mediaError"
            ? "This stream could not be decoded by this browser."
            : "This source stopped responding.",
        )
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
          frag: { duration: number; level: number; type: string }
          stats: { loaded: number }
        },
      ) => {
        const calculatedBitrate =
          data.stats.loaded > 0 && data.frag.duration > 0
            ? (data.stats.loaded * 8) / data.frag.duration
            : undefined
        updateBitrate(calculatedBitrate)
        measureBandwidth(data.frag.level, data.stats.loaded, data.frag.duration)
        updateFromLevel(data.frag.level)
        // hls.js discovers embedded CEA tracks only once it reads caption
        // packets. Three 10-second fragments is enough to stop presenting an
        // endless loading state for streams that do not expose any tracks.
        if (data.frag.type === "main" && ++bufferedMainFragments >= 3) {
          setCaptionTracksLoading(false)
        }
      }

      hls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed)
      hls.on(Hls.Events.CUES_PARSED, handleCuesParsed)
      hls.on(Hls.Events.ERROR, handleHlsError)
      hls.on(Hls.Events.LEVEL_SWITCHING, handleLevelSwitching)
      hls.on(Hls.Events.LEVEL_SWITCHED, handleLevelSwitched)
      hls.on(Hls.Events.FRAG_BUFFERED, handleFragBuffered)
      allowEmbeddedCaptions()
      updateFromLevel()

      removeHlsListeners = () => {
        hls.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed)
        hls.off(Hls.Events.CUES_PARSED, handleCuesParsed)
        hls.off(Hls.Events.ERROR, handleHlsError)
        hls.off(Hls.Events.LEVEL_SWITCHING, handleLevelSwitching)
        hls.off(Hls.Events.LEVEL_SWITCHED, handleLevelSwitched)
        hls.off(Hls.Events.FRAG_BUFFERED, handleFragBuffered)
      }

      return true
    }

    // Video.js/VHS owns HLS for the ordinary <video> element. Do not keep
    // polling for the previous Mux hls.js instance after the transport changes.
    connectToHls()

    playerElement.addEventListener("loadedmetadata", updateFromNativeVideo)
    // And whenever the frame changes size, which is what a rendition switch
    // looks like from here. loadedmetadata alone catches the size the stream
    // opened at, and a player opens low and climbs -- so on a manifest that
    // declares no RESOLUTION we would have recorded the 480p it started on and
    // never the 1080p it settled at.
    playerElement.addEventListener("resize", updateFromNativeVideo)
    playerElement.addEventListener("timeupdate", updateActiveCaption)
    playerElement.textTracks.addEventListener("change", updateActiveCaption)
    playerElement.textTracks.addEventListener("addtrack", updateActiveCaption)
    updateFromNativeVideo()
    updateActiveCaption()

    return () => {
      hdrCheckId += 1
      if (hdrFrameCallbackId !== undefined) {
        playerElement.cancelVideoFrameCallback?.(hdrFrameCallbackId)
      }
      if (intervalId) window.clearInterval(intervalId)
      if (frameRateSampleIntervalId) {
        window.clearInterval(frameRateSampleIntervalId)
      }
      playerElement.removeEventListener("loadedmetadata", updateFromNativeVideo)
      playerElement.removeEventListener("resize", updateFromNativeVideo)
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
  }, [channel.savedChannelId, failStream, playerElement, streamUrl])

  if (resolveError) {
    return (
      <div className="border-destructive/40 bg-destructive/10 text-destructive flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border p-4 text-center text-sm">
        <AlertCircleIcon className="size-6" />
        <p className="max-w-md">{resolveError}</p>
        {hasNextSource && !fallbackCancelled ? (
          <p className="text-destructive/75 flex items-center gap-1.5 text-xs tabular-nums">
            <LoaderCircleIcon className="size-3.5 animate-spin" />
            Trying the next source in{" "}
            {fallbackSeconds ?? FAILOVER_DELAY_SECONDS}…
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2">
          {hasNextSource ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                setFallbackCancelled(true)
                reportUnplayable.current?.(resolveError)
              }}
            >
              Try next source
            </Button>
          ) : null}
          {onChooseSource ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onChooseSource}
            >
              Choose source
            </Button>
          ) : null}
          {streamUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                window.location.assign(getExternalPlayerUrl("vlc", streamUrl))
              }}
            >
              <ExternalLinkIcon />
              Open in VLC
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (!streamUrl) {
    return <div className="aspect-video w-full rounded-lg bg-black" />
  }

  return (
    <MediaPlayer
      key={`${channelKey}-${streamUrl}`}
      autoHide
      className="group/player aspect-video w-full overflow-hidden rounded-lg bg-black"
    >
      <MediaPlayerVideo
        ref={(element) => setPlayerElement(element ?? null)}
        playsInline
        className="h-full w-full bg-black object-contain"
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
          {/* The list's tile, at full strength. Same width, same corner, same
              colour and the same redrawn mark, so the channel looks like
              itself here as well. It sits on the controls' own gradient, which
              is already holding the video back — a second veil over the tile
              only made the mark harder to read. */}
          {logoUrl ? <ChannelLogo url={logoUrl} /> : null}
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-lg font-semibold text-white">
              {channel.name || "Live stream"}
            </h2>
            {/* The two badges and nothing else. The category was the portal's
                filing of this one stream — one operator's "SPORTS | GENERAL"
                against another's word for the same channel — so it changed
                under the viewer when they switched source, and said nothing
                about the channel either way. */}
            <div className="flex min-w-0 items-center gap-2 text-sm text-white/60">
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
                isHdrPlaying={isHdrPlaying}
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
            <MediaPlayerSettings
              captionTracks={captionTracks}
              captionTracksLoading={captionTracksLoading}
              selectedCaptionTrackId={selectedCaptionTrack?.id}
              onCaptionTrackSelect={(trackId) =>
                selectCaptionTrack(
                  captionTracks.find((track) => track.id === trackId) ?? null,
                )
              }
            />
            {/* No narrow-width hiding, unlike picture-in-picture: casting is
                most of the point of holding a phone, and the button already
                takes itself away wherever no receiver can be reached. */}
            <MediaPlayerCast
              src={streamUrl}
              title={channel.name || "Live stream"}
              subtitle={channel.portalSource?.name}
              poster={castPosterUrl}
              live
            />
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
  isHdrPlaying,
  className,
}: {
  variant: StreamVariant
  isHdrPlaying: boolean
  className?: string
}) {
  const label = [variant.resolutionLabel, variant.frameRateLabel]
    .filter(Boolean)
    .join(" • ")
  const labelWithBitrate = variant.bitrateLabel
    ? [label, variant.bitrateLabel].filter(Boolean).join(" @ ")
    : label

  if (!labelWithBitrate && !isHdrPlaying) return null

  return (
    <>
      {labelWithBitrate ? (
        <Badge
          variant="outline"
          className={cn(
            "animate-in fade-in-0 slide-in-from-bottom-1 h-5 duration-300 ease-out",
            className,
          )}
        >
          {labelWithBitrate}
        </Badge>
      ) : null}
      {isHdrPlaying ? (
        <Badge
          variant="outline"
          className={cn(
            "animate-in fade-in-0 slide-in-from-bottom-1 h-5 font-semibold duration-300 ease-out",
            className,
          )}
        >
          HDR
        </Badge>
      ) : null}
    </>
  )
}
