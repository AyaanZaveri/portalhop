import { NextResponse } from "next/server"

import { getIptvOrgChannels } from "@/lib/iptv-org"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  try {
    const channels = await getIptvOrgChannels()

    return NextResponse.json(
      { channels },
      {
        headers: {
          // Public data, safe to cache in the browser/CDN.
          "Cache-Control":
            "public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400",
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load the iptv-org playlist.",
      },
      { status: 502 }
    )
  }
}
