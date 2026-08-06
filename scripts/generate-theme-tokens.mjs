// oklch() -> sRGB hex. React Native cannot parse oklch(), so the palette has to
// be resolved ahead of time. Standard OKLab pipeline; no dependency needed.
import { readFileSync, writeFileSync } from "node:fs"

function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]

  let clipped = false
  const srgb = lin.map((v) => {
    if (v < -0.0001 || v > 1.0001) clipped = true
    const c = Math.min(1, Math.max(0, v))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  })

  return {
    hex:
      "#" +
      srgb
        .map((v) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join(""),
    clipped,
  }
}

const css = readFileSync(process.argv[2], "utf8")

function block(name, re) {
  const m = css.match(re)
  if (!m) throw new Error("block not found: " + name)
  const out = {}
  const notes = []
  for (const [, token, body] of m[1].matchAll(
    /--([a-z0-9-]+):\s*(oklch\([^)]*\))\s*;/g,
  )) {
    const nums = body.match(/oklch\(([^)]*)\)/)[1].trim()
    // Alpha form: `oklch(1 0 0 / 10%)`
    const [coords, alphaRaw] = nums.split("/").map((s) => s && s.trim())
    const [L, C, H] = coords.split(/\s+/).map(Number)
    const { hex, clipped } = oklchToRgb(L, C || 0, H || 0)
    if (alphaRaw) {
      const alpha = alphaRaw.endsWith("%")
        ? Number(alphaRaw.slice(0, -1)) / 100
        : Number(alphaRaw)
      const aa = Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0")
      out[token] = hex + aa
    } else {
      out[token] = hex
    }
    if (clipped) notes.push(`${token} (${body})`)
  }
  return { out, notes }
}

const light = block(":root", /:root\s*\{([\s\S]*?)\n\}/)
const dark = block(".dark", /\.dark\s*\{([\s\S]*?)\n\}/)

console.log("OUT OF sRGB GAMUT (clipped):")
for (const n of new Set([...light.notes, ...dark.notes])) console.log("  " + n)

const body = `// GENERATED from src/app/globals.css — do not hand-edit.
// Regenerate with: node scripts/generate-theme-tokens.mjs
//
// React Native cannot parse oklch(), so the palette is resolved to sRGB here and
// both platforms read these values. Colours marked out-of-gamut in the generator
// output are clipped: notably --primary, whose lime is more saturated than sRGB
// can represent, so it renders slightly duller than the web app on a P3 display.

export const lightTokens = ${JSON.stringify(light.out, null, 2)} as const

export const darkTokens = ${JSON.stringify(dark.out, null, 2)} as const

export type ThemeTokens = typeof lightTokens
export type ThemeTokenName = keyof ThemeTokens

/** Radius scale, derived from --radius: 0.625rem (10px). */
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  "2xl": 18,
  "3xl": 22,
  "4xl": 26,
} as const

/** The app's motion curve — cubic-bezier(0.23, 1, 0.32, 1). */
export const easeOut = [0.23, 1, 0.32, 1] as const
`

writeFileSync(process.argv[3], body)
console.log("\nwrote", process.argv[3])
console.log("light tokens:", Object.keys(light.out).length, "| dark:", Object.keys(dark.out).length)
