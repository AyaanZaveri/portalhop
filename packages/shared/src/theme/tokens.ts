// GENERATED from src/app/globals.css — do not hand-edit.
// Regenerate with: node scripts/generate-theme-tokens.mjs
//
// React Native cannot parse oklch(), so the palette is resolved to sRGB here and
// both platforms read these values. Colours marked out-of-gamut in the generator
// output are clipped: notably --primary, whose lime is more saturated than sRGB
// can represent, so it renders slightly duller than the web app on a P3 display.

export const lightTokens = {
  "card": "#ffffff",
  "card-foreground": "#0a0a0a",
  "popover": "#ffffff",
  "popover-foreground": "#0a0a0a",
  "primary": "#9ae600",
  "primary-foreground": "#35530e",
  "secondary": "#f4f4f5",
  "secondary-foreground": "#18181b",
  "muted": "#f5f5f5",
  "muted-foreground": "#737373",
  "accent": "#f5f5f5",
  "accent-foreground": "#171717",
  "destructive": "#e7000b",
  "border": "#e5e5e5",
  "input": "#e5e5e5",
  "ring": "#a1a1a1",
  "chart-1": "#d4d4d4",
  "chart-2": "#737373",
  "chart-3": "#525252",
  "chart-4": "#404040",
  "chart-5": "#262626",
  "sidebar": "#fafafa",
  "sidebar-foreground": "#0a0a0a",
  "sidebar-primary": "#5ea500",
  "sidebar-primary-foreground": "#f7fee7",
  "sidebar-accent": "#f5f5f5",
  "sidebar-accent-foreground": "#171717",
  "sidebar-border": "#e5e5e5",
  "sidebar-ring": "#a1a1a1",
  "background": "#ffffff",
  "foreground": "#0a0a0a"
} as const

export const darkTokens = {
  "background": "#0a0a0a",
  "foreground": "#fafafa",
  "card": "#171717",
  "card-foreground": "#fafafa",
  "popover": "#171717",
  "popover-foreground": "#fafafa",
  "primary": "#7ccf00",
  "primary-foreground": "#35530e",
  "secondary": "#27272a",
  "secondary-foreground": "#fafafa",
  "muted": "#262626",
  "muted-foreground": "#a1a1a1",
  "accent": "#262626",
  "accent-foreground": "#fafafa",
  "destructive": "#ff6467",
  "border": "#ffffff1a",
  "input": "#ffffff26",
  "ring": "#737373",
  "chart-1": "#d4d4d4",
  "chart-2": "#737373",
  "chart-3": "#525252",
  "chart-4": "#404040",
  "chart-5": "#262626",
  "sidebar": "#171717",
  "sidebar-foreground": "#fafafa",
  "sidebar-primary": "#7ccf00",
  "sidebar-primary-foreground": "#192e03",
  "sidebar-accent": "#262626",
  "sidebar-accent-foreground": "#fafafa",
  "sidebar-border": "#ffffff1a",
  "sidebar-ring": "#737373"
} as const

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
