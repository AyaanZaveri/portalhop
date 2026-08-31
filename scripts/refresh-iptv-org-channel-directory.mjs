import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const SOURCE_URL = "https://iptv-org.github.io/api/channels.json"
const OUTPUT_PATH = resolve("public/iptv-org-channel-directory.json")

const response = await fetch(SOURCE_URL)
if (!response.ok) {
  throw new Error(`IPTV-org channel directory failed: ${response.status} ${response.statusText}`)
}

const channels = await response.json()
if (!Array.isArray(channels)) {
  throw new Error("IPTV-org channel directory was not an array.")
}

// The matcher needs only the canonical XMLTV id, display name, official aliases
// and country. Tuple rows keep the checked-in public asset compact and avoid
// copying unrelated API metadata into every Vercel deployment.
const directory = channels
  .filter(
    (channel) =>
      channel &&
      typeof channel.id === "string" &&
      channel.id.trim() &&
      typeof channel.name === "string" &&
      channel.name.trim() &&
      !channel.closed,
  )
  .map((channel) => [
    channel.id.trim(),
    channel.name.trim(),
    Array.isArray(channel.alt_names)
      ? channel.alt_names
          .filter((alias) => typeof alias === "string" && alias.trim())
          .map((alias) => alias.trim())
      : [],
    typeof channel.country === "string" ? channel.country.trim().toUpperCase() : "",
  ])

await mkdir(dirname(OUTPUT_PATH), { recursive: true })
await writeFile(OUTPUT_PATH, JSON.stringify(directory))
console.log(`Wrote ${directory.length.toLocaleString()} channels to ${OUTPUT_PATH}`)
