// Generated fallback avatars come from DiceBear's hosted API as plain image
// URLs, so they slot into the same `user.image` field as Google photos or a
// future user upload — every avatar source is just a URL rendered by <img>.
// Swapping to a self-hosted DiceBear endpoint later only changes this URL, not
// the storage model.

const DICEBEAR_VERSION = "9.x"
const DICEBEAR_STYLE = "glass"

// Lime-adjacent Tailwind hues (amber/lime/emerald/cyan/sky, 400) matching the
// app accent. DiceBear wants bare hex, no leading '#'.
const DICEBEAR_BACKGROUND = ["fbbf24", "a3e635", "34d399", "22d3ee", "38bdf8"]

export function generatedAvatarUrl(seed: string): string {
  const url = new URL(
    `https://api.dicebear.com/${DICEBEAR_VERSION}/${DICEBEAR_STYLE}/svg`
  )
  url.searchParams.set("seed", seed)
  url.searchParams.set("backgroundColor", DICEBEAR_BACKGROUND.join(","))

  return url.href
}

// A fresh seed for "shuffle" — crypto.randomUUID is available in every browser
// this app targets (secure context).
export function randomAvatarSeed(): string {
  return crypto.randomUUID()
}
