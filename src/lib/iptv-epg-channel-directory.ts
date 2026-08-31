import { readFile } from "node:fs/promises"
import path from "node:path"

import type { EpgChannelEntry } from "@/lib/channel-matcher"
import { buildEpgIndex, type EpgIndex } from "@/lib/channel-matcher"

const CACHE_SECONDS = 10 * 60
const DIRECTORY_PATH = path.join(
  process.cwd(),
  "public",
  "iptv-epg-channel-directory.json",
)

type DirectoryRow = [
  id: string,
  name: string,
  alternativeNames: string[],
  countryCode: string,
]

let cachedDirectory: Record<string, EpgChannelEntry> | null = null
let cachedUntil = 0
let loadingDirectory: Promise<Record<string, EpgChannelEntry>> | null = null
let cachedIndex: EpgIndex | null = null

/**
 * Channel identities extracted from IPTV-EPG's XMLTV database by
 * `bun run refresh:iptv-epg-directory`. Production only reads this bundled
 * asset: it never downloads or parses a database XMLTV feed while enriching.
 */
export async function getIptvEpgChannelDirectory(): Promise<
  Record<string, EpgChannelEntry>
> {
  if (cachedDirectory && Date.now() < cachedUntil) return cachedDirectory
  if (loadingDirectory) return loadingDirectory

  loadingDirectory = (async () => {
    let rows: DirectoryRow[]
    try {
      rows = JSON.parse(await readFile(DIRECTORY_PATH, "utf8")) as DirectoryRow[]
    } catch (error) {
      throw new Error(
        `Could not load the bundled IPTV-EPG directory. Run \`bun run refresh:iptv-epg-directory\` before deploying. ${error instanceof Error ? error.message : ""}`,
      )
    }

    const directory: Record<string, EpgChannelEntry> = {}
    for (const [id, name, alternativeNames, countryCode] of rows) {
      if (!id || !name) continue
      directory[id.toLowerCase()] = {
        id,
        name,
        countryCode: countryCode || undefined,
        alternativeNames,
      }
    }

    cachedDirectory = directory
    cachedUntil = Date.now() + CACHE_SECONDS * 1_000
    return directory
  })()

  try {
    return await loadingDirectory
  } finally {
    loadingDirectory = null
  }
}

/** The matcher index is built once per warm process, never per sheet search. */
export async function getIptvEpgChannelIndex(): Promise<EpgIndex> {
  if (cachedIndex) return cachedIndex
  cachedIndex = buildEpgIndex(Object.values(await getIptvEpgChannelDirectory()))
  return cachedIndex
}
