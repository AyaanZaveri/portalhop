/**
 * A minimal Google Cast web sender.
 *
 * media-chrome ships cast state out of the box, but it reads it off
 * `video.remote` — the Remote Playback API — and that only knows how to hand a
 * receiver a plain media URL. This player runs HLS through hls.js, so the
 * element's src is a blob backed by MSE, and `remote.watchAvailability()`
 * rejects with NotSupportedError against it. Mux's own answer is the
 * `<castable-video>` element, which carries a separate `cast-src`; that is a
 * custom element, and the video here is `<MuxVideo>` rendered by React.
 *
 * So the sender is driven directly instead, and the manifest URL is passed in
 * rather than read off the element. AirPlay needs none of this — WebKit picks
 * the stream up itself — and is handled in use-remote-playback.
 */

const SDK_SRC =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"

// The SDK signals availability through a global callback rather than the
// script's load event, and stays silent in browsers that shipped the file but
// not the API. Nothing then resolves the promise, so the wait is bounded.
const SDK_TIMEOUT = 5000

/** The slice of the sender API this module touches. */
type CastNamespace = {
  cast: {
    AutoJoinPolicy: { ORIGIN_SCOPED: string }
    Image: new (url: string) => unknown
    media: {
      DEFAULT_MEDIA_RECEIVER_APP_ID: string
      StreamType: { LIVE: string; BUFFERED: string }
      GenericMediaMetadata: new () => {
        title?: string
        subtitle?: string
        images?: unknown[]
      }
      MediaInfo: new (
        contentId: string,
        contentType: string,
      ) => {
        streamType: string
        metadata?: unknown
        customData?: unknown
      }
      LoadRequest: new (mediaInfo: unknown) => { autoplay: boolean }
    }
  }
  framework: {
    CastContext: {
      getInstance: () => CastContext
    }
    CastContextEventType: { CAST_STATE_CHANGED: string }
    CastState: {
      NO_DEVICES_AVAILABLE: string
      NOT_CONNECTED: string
      CONNECTING: string
      CONNECTED: string
    }
  }
}

export type CastSession = {
  loadMedia: (request: unknown) => Promise<unknown>
  endSession: (stopCasting: boolean) => void
  getCastDevice: () => { friendlyName?: string } | null
}

export type CastContext = {
  setOptions: (options: {
    receiverApplicationId: string
    autoJoinPolicy: string
  }) => void
  requestSession: () => Promise<string | undefined>
  getCastState: () => string
  getCurrentSession: () => CastSession | null
  endCurrentSession: (stopCasting: boolean) => void
  addEventListener: (type: string, handler: (event: unknown) => void) => void
  removeEventListener: (type: string, handler: (event: unknown) => void) => void
}

declare global {
  interface Window {
    cast?: Pick<CastNamespace, "framework">
    chrome?: Pick<CastNamespace, "cast">
    __onGCastApiAvailable?: (available: boolean) => void
  }
}

let sdkPromise: Promise<CastNamespace | null> | null = null

function readSdk(): CastNamespace | null {
  if (typeof window === "undefined") return null
  const framework = window.cast?.framework
  const cast = window.chrome?.cast
  if (!framework || !cast) return null
  return { framework, cast }
}

/**
 * Loads the sender SDK once per document, resolving null wherever casting
 * isn't on offer — every non-Chromium browser, and the Android WebView the
 * packaged app runs in, which has `window.chrome` but no sender.
 */
export function loadCastSdk(): Promise<CastNamespace | null> {
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<CastNamespace | null>((resolve) => {
    const loaded = readSdk()
    if (loaded) return resolve(loaded)

    if (typeof window === "undefined" || !window.chrome) return resolve(null)

    const timeout = window.setTimeout(() => resolve(null), SDK_TIMEOUT)
    const settle = (value: CastNamespace | null) => {
      window.clearTimeout(timeout)
      resolve(value)
    }

    // Has to be in place before the script runs: the SDK calls it as soon as it
    // has decided either way.
    window.__onGCastApiAvailable = (available) => {
      settle(available ? readSdk() : null)
    }

    const script = document.createElement("script")
    script.src = SDK_SRC
    script.async = true
    script.onerror = () => settle(null)
    document.head.appendChild(script)
  })

  return sdkPromise
}

let configured = false

/** The shared context, with the default receiver registered on first use. */
export async function getCastContext(): Promise<CastContext | null> {
  const sdk = await loadCastSdk()
  if (!sdk) return null

  const context = sdk.framework.CastContext.getInstance()
  if (!configured) {
    context.setOptions({
      receiverApplicationId: sdk.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: sdk.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    })
    configured = true
  }
  return context
}

export type CastMedia = {
  src: string
  title?: string
  subtitle?: string
  poster?: string
  live?: boolean
}

/** Hands the receiver the manifest itself, which is what it can actually play. */
export async function loadCastMedia(session: CastSession, media: CastMedia) {
  const sdk = readSdk()
  if (!sdk) return

  const mediaInfo = new sdk.cast.media.MediaInfo(
    media.src,
    "application/x-mpegurl",
  )
  mediaInfo.streamType = media.live
    ? sdk.cast.media.StreamType.LIVE
    : sdk.cast.media.StreamType.BUFFERED

  const metadata = new sdk.cast.media.GenericMediaMetadata()
  if (media.title) metadata.title = media.title
  if (media.subtitle) metadata.subtitle = media.subtitle
  if (media.poster) metadata.images = [new sdk.cast.Image(media.poster)]
  mediaInfo.metadata = metadata

  const request = new sdk.cast.media.LoadRequest(mediaInfo)
  request.autoplay = true

  await session.loadMedia(request)
}

export function getCastStateNames() {
  const sdk = readSdk()
  return sdk?.framework.CastState ?? null
}
