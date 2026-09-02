import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { getUserIdByFavoritesToken } from "@/db/favorites-token"
import { savedChannels, savedSources } from "@/db/schema"
import { getEpgChannelMetadata } from "@/lib/epg-store"
import { logoTileKey, renderLogoTile } from "@/lib/logo-tile"
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
    })
    .from(savedChannels)
    .innerJoin(savedSources, eq(savedChannels.sourceId, savedSources.id))
    .where(
      and(eq(savedChannels.id, channelId), eq(savedSources.userId, userId)),
    )
    .limit(1)

  // Match the catalogue route: the canonical IPTV-EPG logo belongs to the
  // channel, while a portal's artwork only describes one of its streams.
  const lookupId = normalizeXmltvId(row?.xmltvId)
  const epgMetadata = lookupId ? await getEpgChannelMetadata([lookupId]) : {}
  const logoUrl = epgMetadata[lookupId]?.logoUrl || row?.logoUrl || row?.logo
  // The playlist names the generated PNG (`<hash>.png`) so media players can
  // identify it as an image. Dynamic route params include that extension; the
  // tile key itself deliberately does not.
  const tileKey = key.replace(/\.png$/i, "")
  if (!logoUrl || tileKey !== logoTileKey(logoUrl)) {
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
