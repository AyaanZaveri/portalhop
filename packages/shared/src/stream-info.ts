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
  /** In bits per second: the stream's own figure, or ours — see the flags. */
  bandwidth: number | null
  /**
   * Whether a figure was measured rather than declared.
   *
   * A declared figure is a property of the rendition and holds against another
   * portal's. A measured one is what this client saw on this connection, which
   * is worth showing — most streams declare almost nothing — but not worth
   * passing off as the same kind of fact.
   */
  frameRateMeasured?: boolean
  bandwidthMeasured?: boolean
  seenAt?: string
}

/** The larger of two figures, treating an absent one as no claim at all. */
function higher(a: number | null | undefined, b: number | null | undefined) {
  if (a == null) return b ?? null
  if (b == null) return a
  return Math.max(a, b)
}

/**
 * The best two readings of one stream have offered, figure by figure.
 *
 * The rule everything here runs on. A stream is several renditions and a player
 * moves between them, so the reading at any moment says what is playing rather
 * than what the stream is — and a portal's 1080p feed that dipped to 480p for a
 * bad minute is still a 1080p feed. Taking the maximum is what makes the figure
 * a property of the stream instead of a snapshot of the connection.
 *
 * It earns its keep three times over: writing, where monotonic figures bound
 * the writes to the renditions climbed rather than to how long somebody
 * watched; reading, where what the table holds is already the best seen and
 * merging in a live reading must not undercut it; and drawing, where a badge
 * that only ever climbs cannot flicker down mid-ramp.
 *
 * Each measured flag travels with the figure it describes, since "measured" is
 * a fact about where one number came from and means nothing beside another's.
 */
export function bestStreamInfo(
  a: Partial<StreamInfo> | undefined,
  b: Partial<StreamInfo> | undefined,
): StreamInfo {
  const left = a ?? {}
  const right = b ?? {}

  const frameRate = higher(left.frameRate, right.frameRate)
  const bandwidth = higher(left.bandwidth, right.bandwidth)
  const frameRateFrom = frameRate === left.frameRate ? left : right
  const bandwidthFrom = bandwidth === left.bandwidth ? left : right

  return {
    width: higher(left.width, right.width),
    height: higher(left.height, right.height),
    frameRate,
    bandwidth,
    frameRateMeasured: frameRate == null ? false : frameRateFrom.frameRateMeasured,
    bandwidthMeasured: bandwidth == null ? false : bandwidthFrom.bandwidthMeasured,
  }
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

/**
 * A stored reading updated by a new one, the way the table does it.
 *
 * The mirror of what the database is told to do on conflict, and here for the
 * same reason: a client patches its own copy the moment it reports, so if the
 * two disagreed the screen would show something the row does not say until the
 * next reload put it right.
 *
 * A figure the reading does not carry is not a figure the reading denies. No
 * client learns all four at once and the phone cannot measure two of them at
 * all, so overwriting wholesale means every player deletes what the last one
 * worked out. A figure it does carry replaces what is there, lower or not,
 * because a portal that requantises a stream really has changed it.
 *
 * Distinct from bestStreamInfo, which takes the larger of two figures. That one
 * settles what a stream is across the renditions of a single viewing; this one
 * settles what is known about it across viewings, players and machines, where
 * larger is not better and only newer is.
 */
export function withNewReading(
  stored: Partial<StreamInfo> | undefined,
  reading: Partial<StreamInfo>,
): StreamInfo {
  const held = stored ?? {}
  // Each mark moves with its own figure. A reading that carries a frame rate
  // brings the fact of how it got it; one that carries none must leave both
  // the stored figure and the stored mark exactly as they are.
  const knowsFrameRate = reading.frameRate != null
  const knowsBandwidth = reading.bandwidth != null

  return {
    width: reading.width ?? held.width ?? null,
    height: reading.height ?? held.height ?? null,
    frameRate: knowsFrameRate ? reading.frameRate! : (held.frameRate ?? null),
    frameRateMeasured: knowsFrameRate
      ? reading.frameRateMeasured
      : held.frameRateMeasured,
    bandwidth: knowsBandwidth ? reading.bandwidth! : (held.bandwidth ?? null),
    bandwidthMeasured: knowsBandwidth
      ? reading.bandwidthMeasured
      : held.bandwidthMeasured,
    seenAt: reading.seenAt ?? held.seenAt,
  }
}

/** The badges a stream earns, in the order they should be read. */
export function streamLabels(info: Partial<StreamInfo> | undefined) {
  if (!info) return []
  return [resolutionLabel(info), frameRateLabel(info), bandwidthLabel(info)].filter(
    (label): label is string => Boolean(label),
  )
}
