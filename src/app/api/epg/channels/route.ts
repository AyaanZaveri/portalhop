import { NextResponse } from "next/server";
import { getEpgChannels } from "@/lib/epg-store";
import { rankEpgMatches } from "@/lib/epg-search";
import { getUserEpgChannelMaps } from "@/lib/user-epg-store";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
// Without this Next treats the handler as static and replays one cached
// response for every request, so request.url arrives with its query string
// stripped and ?q= never reaches the search branch. The explicit
// Cache-Control headers below still let the CDN cache each distinct URL.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const channels = await getEpgChannels();
    const params = new URL(request.url).searchParams;

    // Searching server-side keeps the 5.8MB directory on the server; a client
    // picking one listing has no use for the other 28,000.
    const query = params.get("q");
    if (query !== null) {
      const limit = Math.min(Number(params.get("limit")) || 8, 25);
      const results = rankEpgMatches(
        Object.entries(channels).map(([xmltvId, entry]) => ({ xmltvId, ...entry })),
        query,
        limit,
      );
      return NextResponse.json({ results }, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    }

    const ids = params.get("sourceIds")?.split(",").map(Number).filter(Number.isInteger) ?? [];
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
