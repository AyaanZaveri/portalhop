import { NextResponse } from "next/server";
import { getEpgChannels } from "@/lib/epg-store";
import { getUserEpgChannelMaps } from "@/lib/user-epg-store";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const channels = await getEpgChannels();
    const ids = new URL(request.url).searchParams.get("sourceIds")?.split(",").map(Number).filter(Number.isInteger) ?? [];
    if (ids.length) {
      const user = await requireUser();
      if (user instanceof NextResponse) return user;
      return NextResponse.json({ builtin: channels, custom: await getUserEpgChannelMaps(user.id, ids) });
    }

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
