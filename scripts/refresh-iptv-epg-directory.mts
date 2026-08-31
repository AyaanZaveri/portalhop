import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import { EPG_SOURCES } from "../packages/shared/src/epg-sources"
import { fetchAndParseEpg } from "../src/lib/epg-parser"

const OUTPUT_PATH = resolve("public/iptv-epg-channel-directory.json")
const CONCURRENCY = 3

type DirectoryEntry = {
  id: string
  name: string
  aliases: Set<string>
  countryCode: string
}

function countryFor(id: string, sourceCountry: string): string {
  // IPTV-EPG IDs conventionally end in their market code (e.g. `.uk`). That
  // signal describes an international feed more accurately than the XML file
  // it appeared in; otherwise retain the guide's ISO source country.
  const suffix = id.match(/\.([a-z]{2})$/i)?.[1]
  const country = (suffix || sourceCountry).toUpperCase()
  // XMLTV uses `.uk` in channel IDs, whereas category detection and ISO 3166
  // use GB. Keep the directory on the same canonical country code.
  return country === "UK" ? "GB" : country
}

const directory = new Map<string, DirectoryEntry>()
let nextSource = 0

async function worker() {
  for (;;) {
    const source = EPG_SOURCES[nextSource++]
    if (!source) return

    const channels = await fetchAndParseEpg(source.url)
    for (const channel of channels) {
      const id = channel.id.trim()
      const name = channel.name.trim()
      if (!id || !name) continue

      const key = id.toLowerCase()
      const existing = directory.get(key)
      if (existing) {
        if (existing.name !== name) existing.aliases.add(name)
        continue
      }

      directory.set(key, {
        id,
        name,
        aliases: new Set(),
        countryCode: countryFor(id, source.code),
      })
    }
    console.log(`${source.code}: ${channels.length.toLocaleString()} channels`)
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const rows = [...directory.values()]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((entry) => [
    entry.id,
    entry.name,
    [...entry.aliases].sort((a, b) => a.localeCompare(b)),
    entry.countryCode,
  ])

await mkdir(dirname(OUTPUT_PATH), { recursive: true })
await writeFile(OUTPUT_PATH, JSON.stringify(rows))
console.log(`Wrote ${rows.length.toLocaleString()} IPTV-EPG channels to ${OUTPUT_PATH}`)
