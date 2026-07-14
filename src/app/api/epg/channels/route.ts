import { NextResponse } from "next/server";
import { getEpgChannels } from "@/lib/epg-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const channels = await getEpgChannels();

    // The channel directory is public and identical for every user, and only
    // changes when someone refreshes it from Settings -> EPG. Let the CDN serve
    // it so a ~28k-row read doesn't run against Postgres on every page load.
    return NextResponse.json(channels, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
