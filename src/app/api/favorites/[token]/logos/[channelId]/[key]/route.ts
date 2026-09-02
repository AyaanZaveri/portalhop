import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { getUserIdByFavoritesToken } from "@/db/favorites-token"
import { savedChannels, savedSources } from "@/db/schema"
import { getEpgChannelMetadata } from "@/lib/epg-store"
import { logoTileKey, renderLogoTile } from "@/lib/logo-tile"
import { getUserEpgChannelMaps } from "@/lib/user-epg-store"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"

export const runtime = "nodejs"

/**
 * Rasterizes the same compact logo tile used in PortalHop's channel rows.
 * The channel remains owner-checked; a player cannot turn this into an
 * arbitrary URL fetcher by supplying its own image URL.
 */
export async function GET(
  _request: Request,
  context: {
    params: Promise<{ token: string; channelId: string; key: string }>
  },
) {
  const { token, channelId: rawChannelId, key } = await context.params
  const channelId = Number(rawChannelId)
  if (!Number.isSafeInteger(channelId) || channelId < 1) {
    return new NextResponse(null, { status: 404 })
  }

  const db = getDb()
  const userId = await getUserIdByFavoritesToken(db, token)
  if (!userId) {
    return new NextResponse(null, { status: 404 })
  }

  const [row] = await db
    .select({
      xmltvId: savedChannels.xmltvId,
      logoUrl: savedChannels.logoUrl,
      logo: savedChannels.logo,
      epgMode: savedSources.epgMode,
      epgSourceId: savedSources.epgSourceId,
    })
    .from(savedChannels)
    .innerJoin(savedSources, eq(savedChannels.sourceId, savedSources.id))
    .where(
      and(eq(savedChannels.id, channelId), eq(savedSources.userId, userId)),
    )
    .limit(1)

  // Use exactly the artwork precedence of the M3U route. A custom guide may
  // supply its own logo, whose tile key is different from the portal artwork.
  // Looking only at the canonical/source variants made those valid playlist
  // URLs fail their hash validation with a 404.
  const lookupId = normalizeXmltvId(row?.xmltvId)
  // The playlist names the generated PNG (`<hash>.png`) so media players can
  // identify it as an image. Dynamic route params include that extension; the
  // tile key itself deliberately does not.
  const tileKey = key.replace(/\.png$/i, "")
  const [epgMetadata, customEpgMaps] = await Promise.all([
    lookupId
      ? getEpgChannelMetadata([lookupId])
      : Promise.resolve(
          {} as Record<
            string,
            { name?: string; logoUrl?: string; countryCode: string }
          >,
        ),
    row?.epgMode === "custom" && row.epgSourceId
      ? getUserEpgChannelMaps(userId, [row.epgSourceId])
      : Promise.resolve(
          {} as Record<number, Record<string, { logoUrl?: string }>>,
        ),
  ])
  const customLogoUrl =
    row?.epgMode === "custom" && row.epgSourceId && lookupId
      ? customEpgMaps[row.epgSourceId]?.[lookupId]?.logoUrl
      : undefined
  const logoUrl = [
    epgMetadata[lookupId]?.logoUrl,
    customLogoUrl,
    row?.logoUrl,
    row?.logo,
  ].find((url) => url && logoTileKey(url) === tileKey)
  if (!logoUrl) {
    return new NextResponse(null, { status: 404 })
  }

  try {
    const response = await fetch(logoUrl, {
      headers: { "User-Agent": "PortalHop logo tile/1.0" },
      signal: AbortSignal.timeout(8_000),
    })
    const contentLength = Number(response.headers.get("content-length"))
    if (
      !response.ok ||
      (Number.isFinite(contentLength) && contentLength > 4_000_000)
    ) {
      throw new Error("Logo download failed or was too large")
    }

    const tile = await renderLogoTile(
      Buffer.from(await response.arrayBuffer()),
      logoUrl,
    )
    return new NextResponse(new Uint8Array(tile), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control":
          "public, max-age=31536000, s-maxage=31536000, immutable",
      },
    })
  } catch {
    // A broken remote logo should never make a playlist's channel entry fail.
    return new NextResponse(null, { status: 404 })
  }
}
