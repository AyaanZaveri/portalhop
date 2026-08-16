/**
 * How a stream's measured figures are written down.
 *
 * Shared so the two clients label a stream the same way. They read it from
 * different places — hls.js levels on the web, a VideoTrack on the phone — and
 * a channel that says "1080p 60 fps" on one and "1080P 59.94FPS" on the other
 * is the same stream failing to look like itself.
 */
export type StreamInfo = {
  width: number | null
  height: number | null
  frameRate: number | null
  /** Declared, in bits per second. Never a measured average — see the table. */
  bandwidth: number | null
  seenAt?: string
}

/**
 * 4K is a width question. A 4K film in a letterbox is 3840x1608, and 2160 lines
 * of height is not what makes it one — which is why this takes both.
 */
export function resolutionLabel({ width, height }: Partial<StreamInfo>) {
  if (!height) return null
  if ((width ?? 0) >= 3840 || height >= 2160) return "4K"
  return `${height}p`
}

/**
 * Rounded only where rounding is honest. 59.94 and 60 are different things and
 * both are common, so a figure that is nearly whole is shown whole and one that
 * is not keeps its decimals.
 */
export function frameRateLabel({ frameRate }: Partial<StreamInfo>) {
  if (!frameRate) return null
  const rounded = Math.round(frameRate)
  const value =
    Math.abs(frameRate - rounded) < 0.05 ? rounded : Number(frameRate.toFixed(2))
  return `${value} fps`
}

/** Megabits, to one decimal: the difference that matters is 2.5 against 6. */
export function bandwidthLabel({ bandwidth }: Partial<StreamInfo>) {
  if (!bandwidth) return null
  return `${(bandwidth / 1_000_000).toFixed(1)} Mbps`
}

/** The badges a stream earns, in the order they should be read. */
export function streamLabels(info: Partial<StreamInfo> | undefined) {
  if (!info) return []
  return [resolutionLabel(info), frameRateLabel(info), bandwidthLabel(info)].filter(
    (label): label is string => Boolean(label),
  )
}
