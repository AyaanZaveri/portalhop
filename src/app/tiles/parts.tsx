"use client"

import {
  ArrowRightIcon,
  FrameIcon,
  Loader2Icon,
  MinusIcon,
  PaintBucketIcon,
  PenToolIcon,
  SunIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { ShimmeringText } from "@/components/ui/shimmering-text"
import { TILE_BASE } from "@/lib/logo-analysis"
import type { LogoStyle } from "@/lib/logo-analysis/algorithm"
import { usePass, type Pass } from "./use-pass"

/* The app's own tile geometry, scaled up so it can be looked at. */
const W = 66
const H = 44
const PAD_X = 11
const PAD_Y = 6
const RADIUS = 10
const MAX_SCALE = 1.8

export const TILE_SCALE = 1.5

function place(style: LogoStyle, boxW: number, boxH: number) {
  const { aspect, content } = style
  if (!aspect || !content || content.width <= 0 || content.height <= 0) return null
  const fitted = Math.min(boxW, boxH * aspect)
  const width = Math.min(
    Math.min(boxW / content.width, (boxH / content.height) * aspect),
    fitted * MAX_SCALE,
  )
  const height = width / aspect
  return {
    width,
    height,
    left: boxW / 2 - width * (content.x + content.width / 2),
    top: boxH / 2 - height * (content.y + content.height / 2),
  }
}

function Shell({
  scale,
  background,
  children,
}: {
  scale: number
  background: string
  children: ReactNode
}) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-clip"
      style={{
        width: W * scale,
        height: H * scale,
        borderRadius: RADIUS * scale,
        background,
        // The tile keeps its own edge whatever the page is doing behind it.
        boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.09)",
      }}
    >
      {children}
    </div>
  )
}

/**
 * What a tile holds while the pass is still running.
 *
 * A spinning icon rather than the canvas indicator this used to be. A canvas
 * cannot paint before hydration, and hydration is the same thing the pass is
 * waiting on, so the indicator could only ever appear at the moment it had
 * almost nothing left to indicate. This is plain SVG and a CSS animation, so it
 * is in the first HTML the server sends and turning before any script has run.
 *
 * Sized off the tile rather than fixed, because the same component fills a
 * 66-pixel roster tile and a 198-pixel figure.
 */
function Waiting({ scale }: { scale: number }) {
  return (
    <Loader2Icon
      className="animate-spin text-white/35"
      size={Math.round(10 * scale)}
      strokeWidth={1.75}
      aria-label="Measuring"
    />
  )
}

/**
 * The step from one tile to the other.
 *
 * Sized off the tile like everything else here rather than fixed. At a constant
 * 16 pixels it reads as a caret between two roster rows and as a speck between
 * two tiles three times that size, and it is the only thing on the page saying
 * these two squares are one operation.
 */
export function Arrow({ scale }: { scale: number }) {
  return (
    <ArrowRightIcon
      aria-hidden
      className="t-arrow"
      strokeWidth={1.5}
      size={Math.round(11 * scale)}
    />
  )
}

/** The logo as it was drawn before any of this: fitted whole, on the base tile. */
export function Before({ url, scale = TILE_SCALE }: { url: string; scale?: number }) {
  return (
    <Shell scale={scale} background={TILE_BASE}>
      <div
        className="relative"
        style={{ width: (W - PAD_X * 2) * scale, height: (H - PAD_Y * 2) * scale }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary logo hosts */}
        <img
          src={url}
          alt=""
          className="size-full object-contain"
          referrerPolicy="no-referrer"
        />
      </div>
    </Shell>
  )
}

/** The same logo after the pass, drawn exactly as the app draws it. */
export function After({ pass, scale = TILE_SCALE }: { pass: Pass; scale?: number }) {
  const style = pass.style ?? {}
  const boxW = (W - PAD_X * 2) * scale
  const boxH = (H - PAD_Y * 2) * scale
  const placement = place(style, boxW, boxH)

  return (
    <Shell scale={scale} background={style.color ?? TILE_BASE}>
      <div
        className="relative flex items-center justify-center overflow-clip"
        style={{ width: boxW, height: boxH }}
      >
        {pass.before ? (
          /* eslint-disable-next-line @next/next/no-img-element -- arbitrary logo hosts */
          <img
            src={pass.after ?? pass.before}
            alt=""
            className="absolute max-w-none object-contain"
            style={placement ?? { width: boxW, height: boxH, left: 0, top: 0 }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <Waiting scale={scale} />
        )}
      </div>
    </Shell>
  )
}

/**
 * Which of the five branches a logo came out of.
 *
 * Set the way the channel list sets the line under a channel name: an icon,
 * then sentence case, small and dimmed. That is already this app's answer for a
 * qualifier sitting under a title, and the route is the same kind of thing as
 * the genre it mirrors.
 *
 * Not uppercase and not mono, though both were tempting. This page spends
 * uppercase on the BEFORE and AFTER column headers and mono on measured
 * numbers, and a route is neither a heading nor a number. Borrowing either
 * treatment would say the wrong thing twice: that these labels head something,
 * or that they were measured.
 */
export const ROUTE: Record<string, { label: string; Icon: LucideIcon }> = {
  border: { label: "Edge continued", Icon: FrameIcon },
  paper: { label: "Light tile", Icon: SunIcon },
  whitened: { label: "Whitened", Icon: PaintBucketIcon },
  redraw: { label: "Redrawn", Icon: PenToolIcon },
  plain: { label: "Left alone", Icon: MinusIcon },
}

/** Both tiles for one channel, on a shared grid so the columns line up. */
export function Pair({
  url,
  name,
  scale = TILE_SCALE,
}: {
  url: string
  name?: string
  scale?: number
}) {
  const pass = usePass(url)
  const route = pass.trace ? ROUTE[pass.trace.route] : undefined
  return (
    // The columns are stated from the scale. Left at a fixed width they hold
    // only the default size, and a larger tile grows straight over its
    // neighbour.
    <div className="t-pair" style={{ ["--tile" as string]: `${W * scale}px` }}>
      <Before url={url} scale={scale} />
      <Arrow scale={scale} />
      <After pass={pass} scale={scale} />
      {name ? (
        <div className="min-w-0">
          <div className="t-pair-name">{name}</div>
          <div className="t-pair-note">
            {route ? (
              <>
                <route.Icon className="t-pair-icon" strokeWidth={1.75} aria-hidden />
                <span className="truncate">{route.label}</span>
              </>
            ) : (
              /* The route is the answer to a measurement, so while it is being
                 measured the line shimmers rather than sitting there as flat
                 text pretending to be one. No spinner beside it: the tile above
                 is already turning one, and the shimmer says the same thing. */
              <ShimmeringText text="Measuring" duration={1.4} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * A measured value, named.
 *
 * Sans for the label because it is a sentence. Mono for the value because it is
 * a number, and numbers only line up under one another in a monospaced face.
 */
export function Stat({
  label,
  value,
  verdict,
}: {
  label: string
  value: ReactNode
  verdict?: "pass" | "fail" | null
}) {
  return (
    <div className="t-stat">
      <dt className="t-stat-label">{label}</dt>
      <dd className="t-stat-value" data-verdict={verdict ?? undefined}>
        {value}
      </dd>
    </div>
  )
}

export function Stats({ children }: { children: ReactNode }) {
  return <dl className="t-stats">{children}</dl>
}

export function Swatch({ color, label }: { color: string; label?: string }) {
  return (
    <span className="t-swatch">
      <span className="t-swatch-chip" style={{ background: color }} />
      {label ?? color}
    </span>
  )
}

/**
 * A render produced by the pass, in the tile's own shape.
 *
 * Same 3:2 box and same inset as the app draws, only larger, so a wide logo
 * sits short inside it and a square one sits tall. Sizing each frame to its
 * image instead is what made one figure fill the page and the next float in
 * empty space.
 *
 * The background is the app's own tile and does not follow the page theme. A
 * figure here is a tile, not a panel: the whole subject is how a logo sits on
 * that exact colour, so turning it white in light mode would show something the
 * app never draws.
 */
export function Figure({
  src,
  caption,
  background = TILE_BASE,
  scale = 3,
}: {
  src?: string
  caption: ReactNode
  background?: string
  scale?: number
}) {
  return (
    <figure className="t-figure" style={{ width: W * scale }}>
      <Shell scale={scale} background={background}>
        <div
          className="relative flex items-center justify-center"
          style={{ width: (W - PAD_X * 2) * scale, height: (H - PAD_Y * 2) * scale }}
        >
          {src ? (
            /* eslint-disable-next-line @next/next/no-img-element -- generated in the browser */
            <img src={src} alt="" className="size-full object-contain" />
          ) : (
            <Waiting scale={scale} />
          )}
        </div>
      </Shell>
      <figcaption className="t-figure-caption">{caption}</figcaption>
    </figure>
  )
}

export function Figures({ children }: { children: ReactNode }) {
  return <div className="t-figures">{children}</div>
}

/** A numbered beat, for an argument that has to be told in order. */
export function Beat({
  step,
  title,
  children,
}: {
  step: string
  title: string
  children: ReactNode
}) {
  return (
    <div className="t-beat">
      <p className="t-beat-title">
        <span className="t-beat-step">{step}</span>
        {title}
      </p>
      {children}
    </div>
  )
}

export const pct = (n: number | undefined) =>
  n === undefined ? "–" : `${(n * 100).toFixed(0)}%`
export const two = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : n.toFixed(2)
