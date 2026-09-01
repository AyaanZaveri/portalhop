import { Hls } from "@mux/playback-core"

import type { StreamInfo } from "@portalhop/shared/stream-info"
import { snapToCommonFrameRate } from "@/lib/tv-channels"

const PROBE_TIMEOUT_MS = 25_000
const PROBE_BUFFER_SECONDS = 10
// Match the visible player: it needs a baseline plus seven one-second samples
// before it has discarded startup noise and kept five stable observations.
const FRAME_RATE_GRACE_MS = 9_000

type ProbeReading = Omit<StreamInfo, "seenAt">

/**
 * Loads the smallest useful slice of an HLS stream without changing the
 * visible player. A manifest provides rendition dimensions, fps and declared
 * bandwidth immediately; one buffered fragment supplies a connection-neutral
 * bitrate when the manifest is sparse.
 */
export function probeHlsStream(
  streamUrl: string,
  onReading: (reading: ProbeReading) => void,
) {
  return new Promise<void>((resolve, reject) => {
    if (!Hls.isSupported()) {
      reject(new Error("This browser cannot probe HLS streams."))
      return
    }

    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    video.setAttribute("aria-hidden", "true")
    video.style.cssText =
      "position:fixed;left:-1px;top:-1px;width:1px;height:1px;opacity:0;pointer-events:none"
    document.body.append(video)

    const hls = new Hls({
      liveSyncMode: "buffered",
      liveSyncDurationCount: 3,
      maxLiveSyncPlaybackRate: 1,
    })
    let settled = false
    let bufferedSeconds = 0
    let frameRateTimer: number | undefined
    let frameRateGraceTimer: number | undefined
    let bufferedEnoughForBitrate = false
    let lastFrameSample: { frames: number; time: number } | null = null
    const frameRateSamples: number[] = []
    let reading: ProbeReading = {
      width: null,
      height: null,
      frameRate: null,
      bandwidth: null,
      frameRateMeasured: false,
      bandwidthMeasured: false,
    }

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (frameRateTimer) window.clearInterval(frameRateTimer)
      if (frameRateGraceTimer) window.clearTimeout(frameRateGraceTimer)
      hls.destroy()
      video.remove()
      if (error) reject(error)
      else resolve()
    }

    const publish = (next: Partial<ProbeReading>) => {
      reading = { ...reading, ...next }
      onReading(reading)
    }

    const timeout = window.setTimeout(
      () => finish(new Error("The stream did not provide probe data in time.")),
      PROBE_TIMEOUT_MS,
    )

    const readManifest = () => {
      const level = hls.levels.reduce<(typeof hls.levels)[number] | undefined>(
        (best, candidate) =>
          !best || candidate.width * candidate.height > best.width * best.height
            ? candidate
            : best,
        undefined,
      )
      if (!level) return
      publish({
        width: level.width || null,
        height: level.height || null,
        frameRate: Number(level.attrs["FRAME-RATE"]) || null,
        bandwidth: level.averageBitrate || null,
        frameRateMeasured: false,
        bandwidthMeasured: false,
      })
    }

    const readVideo = () => {
      if (!video.videoHeight) return
      publish({
        width: video.videoWidth || null,
        height: video.videoHeight,
      })
    }

    const sampleFrameRate = () => {
      if (reading.frameRate != null || video.paused) return
      const quality = video.getVideoPlaybackQuality?.()
      if (!quality) return
      const time = performance.now()
      if (lastFrameSample) {
        const elapsed = (time - lastFrameSample.time) / 1000
        const frames = quality.totalVideoFrames - lastFrameSample.frames
        if (elapsed > 0 && frames > 0) frameRateSamples.push(frames / elapsed)
      }
      lastFrameSample = { frames: quality.totalVideoFrames, time }
      // The decoder commonly starts a little fast while it catches up to the
      // live edge. The player throws away those two samples and only trusts the
      // median of the next five; probes must use the exact same rule or they
      // can incorrectly turn a 25 fps stream into 26–27 fps.
      const stableSamples = frameRateSamples.slice(2)
      if (stableSamples.length < 5) return

      const sorted = [...stableSamples].sort((a, b) => a - b)
      const frameRate = snapToCommonFrameRate(
        sorted[Math.floor(sorted.length / 2)],
      )
      publish({
        frameRate,
        frameRateMeasured: true,
      })
      // Bitrate has already had enough media by this point. Do not make the
      // user wait for the full probe timeout once the missing FPS reading is
      // now known.
      if (bufferedEnoughForBitrate) finish()
    }

    hls.on(Hls.Events.MANIFEST_PARSED, readManifest)
    hls.on(
      Hls.Events.FRAG_BUFFERED,
      (
        _event: typeof Hls.Events.FRAG_BUFFERED,
        data: { frag: { duration: number }; stats: { loaded: number } },
      ) => {
        if (data.frag.duration <= 0 || data.stats.loaded <= 0) return
        bufferedSeconds += data.frag.duration
        const bitrate = Math.round((data.stats.loaded * 8) / data.frag.duration)
        publish({ bandwidth: bitrate, bandwidthMeasured: true })
        if (bufferedSeconds >= PROBE_BUFFER_SECONDS && !bufferedEnoughForBitrate) {
          bufferedEnoughForBitrate = true
          // Fragments can buffer much faster than wall-clock playback. The
          // old immediate finish therefore persisted resolution and bitrate
          // before getVideoPlaybackQuality had observed enough decoded frames
          // to calculate FPS. Give it a bounded window instead.
          if (reading.frameRate != null) {
            finish()
          } else {
            frameRateGraceTimer = window.setTimeout(() => finish(), FRAME_RATE_GRACE_MS)
          }
        }
      },
    )
    hls.on(
      Hls.Events.ERROR,
      (
        _event: typeof Hls.Events.ERROR,
        data: { fatal: boolean; details?: string },
      ) => {
        if (data.fatal) {
          finish(new Error(data.details ?? "The stream could not be probed."))
        }
      },
    )
    video.addEventListener("loadedmetadata", readVideo)
    video.addEventListener("resize", readVideo)
    if (typeof video.getVideoPlaybackQuality === "function") {
      frameRateTimer = window.setInterval(sampleFrameRate, 1000)
    }

    hls.loadSource(streamUrl)
    hls.attachMedia(video)
    void video.play().catch(() => {})
  })
}
