import { readFile } from "node:fs/promises"
import path from "node:path"

import type { EpgChannelEntry } from "@/lib/channel-matcher"

const CACHE_SECONDS = 10 * 60
const DIRECTORY_PATH = path.join(
  process.cwd(),
  "public",
  "iptv-org-channel-directory.json",
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

/**
 * Canonical IPTV-org channel metadata for the matcher, generated into a local
 * public JSON asset by `bun run refresh:iptv-org-directory`.
 *
 * This is intentionally separate from programme data. IPTV-org publishes a
 * The runtime reads the locally deployed asset rather than calling either the
 * IPTV-org API or an XMLTV feed. It avoids all remote directory traffic and
 * XML parsing during enrichment; the in-process cache simply avoids repeatedly
 * decoding the asset while an instance stays warm.
 */
export async function getIptvOrgChannelDirectory(): Promise<
  Record<string, EpgChannelEntry>
> {
  if (cachedDirectory && Date.now() < cachedUntil) {
    return cachedDirectory
  }

  if (loadingDirectory) {
    return loadingDirectory
  }

  loadingDirectory = (async () => {
    let rows: DirectoryRow[]
    try {
      rows = JSON.parse(await readFile(DIRECTORY_PATH, "utf8")) as DirectoryRow[]
    } catch (error) {
      throw new Error(
        `Could not load the bundled IPTV-org directory. Run \`bun run refresh:iptv-org-directory\` before deploying. ${error instanceof Error ? error.message : ""}`,
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
