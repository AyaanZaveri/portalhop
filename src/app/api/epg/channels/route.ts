import { NextResponse } from "next/server";
import { getEpgChannels } from "@/lib/epg-store";
import { rankEpgMatches } from "@portalhop/shared/epg-search";
import { getUserEpgChannelMaps } from "@/lib/user-epg-store";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db/client";
import { userEpgChannels, userEpgSources } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserSettings } from "@/db/user-settings";

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
      const user = await requireUser();
      if (user instanceof NextResponse) return user;
      const db = getDb();
      const settings = await getUserSettings(db, user.id);
      const customRows = await db
        .select({
          xmltvId: userEpgChannels.channelId,
          name: userEpgChannels.name,
          logoUrl: userEpgChannels.logoUrl,
          sourceId: userEpgSources.id,
          sourceName: userEpgSources.name,
        })
        .from(userEpgChannels)
        .innerJoin(userEpgSources, eq(userEpgChannels.epgSourceId, userEpgSources.id))
        .where(eq(userEpgSources.userId, user.id));

      type Match = { xmltvId: string; name: string; logoUrl?: string; countryCode?: string; providerId: string; providerName: string };
      const providerRank = (providerId: string) => {
        const position = settings.epgProviderOrder.indexOf(providerId);
        return position === -1 ? settings.epgProviderOrder.length + 1 : position;
      };
      const candidates: Match[] = [
        ...Object.entries(channels).map(([xmltvId, entry]) => ({
          xmltvId, ...entry, providerId: "iptv-org", providerName: "Built-in EPG",
        })),
        ...customRows.map((row) => ({
          xmltvId: row.xmltvId,
          name: row.name,
          logoUrl: row.logoUrl ?? undefined,
          providerId: `custom:${row.sourceId}`,
          providerName: row.sourceName,
        })),
      ];
      // A guide id is the thing being assigned. If several providers carry it,
      // expose it once and keep the best ranked provider as the explanation of
      // what automatic guide selection will use after assignment.
      const bestById = new Map<string, Match>();
      const ranked = rankEpgMatches(candidates, query, Math.max(limit * 8, 40)) as Match[];
      for (const match of ranked) {
        const existing = bestById.get(match.xmltvId.toLowerCase());
        if (!existing || providerRank(match.providerId) < providerRank(existing.providerId)) {
          bestById.set(match.xmltvId.toLowerCase(), match);
        }
      }
      const results = [...bestById.values()]
        .sort((a, b) => providerRank(a.providerId) - providerRank(b.providerId) || a.name.localeCompare(b.name))
        .slice(0, limit);
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
