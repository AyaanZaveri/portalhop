import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/tv",
    name: "Portal Hop",
    short_name: "Portal Hop",
    start_url: "/tv",
    scope: "/",
    icons: [
      // "any" icons keep the squircle baked in — they are shown as-authored.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // "maskable" icons are full-bleed squares; the launcher applies its own
      // mask, so the glyph sits inside the 80% safe zone and the corners are
      // square to avoid the mask clipping into a pre-rounded edge.
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    theme_color: "#0d0d0d",
    background_color: "#0d0d0d",
    display: "standalone",
    orientation: "any",
    categories: ["entertainment", "video"],
  }
}
