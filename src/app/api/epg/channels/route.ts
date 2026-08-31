import { NextResponse } from "next/server";
import { getEpgChannels } from "@/lib/epg-store";
import { rankEpgMatches } from "@portalhop/shared/epg-search";
import { getUserEpgChannelMaps } from "@/lib/user-epg-store";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db/client";
import { epgChannels, userEpgChannels, userEpgSources } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  classifyMatch,
  retrieveCandidates,
  type MatchCandidate,
} from "@/lib/channel-matcher";
import { getIptvEpgChannelIndex } from "@/lib/iptv-epg-channel-directory";
import { resolveCategoryVisual } from "@portalhop/shared/category-flags";

export const runtime = "nodejs";
// Without this Next treats the handler as static and replays one cached
// response for every request, so request.url arrives with its query string
// stripped and ?q= never reaches the search branch. The explicit
// Cache-Control headers below still let the CDN cache each distinct URL.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;

    // Searching server-side keeps the 5.8MB directory on the server; a client
    // picking one listing has no use for the other 28,000.
    const query = params.get("q");
    if (query !== null) {
      const limit = Math.min(Number(params.get("limit")) || 8, 25);
      const category = params.get("category") ?? "";
      const user = await requireUser();
      if (user instanceof NextResponse) return user;
      const db = getDb();
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

      // Match the built-in IPTV-EPG directory exactly as auto-match does, but
      // stop before its AI reranking tier. The category can safely affect only
      // suggestion ordering; assigning a result still requires a user click.
      const index = await getIptvEpgChannelIndex();
      const classified = classifyMatch(query, index);
      const builtinCandidates: MatchCandidate[] =
        classified.kind === "exact"
          ? [{
              id: classified.xmltvId,
              name: index.byId.get(classified.xmltvId)?.name ?? classified.xmltvId,
              score: 1,
              countryCode: index.byId.get(classified.xmltvId)?.countryCode,
            }]
          : classified.kind === "regional" || classified.kind === "ambiguous"
            ? classified.candidates
            : retrieveCandidates(query, index, limit);

      const categoryVisual = resolveCategoryVisual(category);
      const categoryCountry = categoryVisual?.kind === "flag"
        ? categoryVisual.code.toUpperCase()
        : "";
      const orderedCandidates = [...builtinCandidates].sort(
        (a, b) =>
          Number(b.countryCode === categoryCountry) - Number(a.countryCode === categoryCountry) ||
          b.score - a.score ||
          a.name.localeCompare(b.name),
      );
      const builtinIds = orderedCandidates.map((candidate) => candidate.id.toLowerCase());
      const logoRows = builtinIds.length
        ? await db
            .select({
              xmltvId: epgChannels.channelIdLower,
              logoUrl: epgChannels.logoUrl,
            })
            .from(epgChannels)
            .where(inArray(epgChannels.channelIdLower, builtinIds))
        : [];
      const logos = new Map(
        logoRows.map((row) => [row.xmltvId, row.logoUrl ?? undefined]),
      );
      const builtin: Match[] = orderedCandidates.map((candidate) => ({
        xmltvId: candidate.id,
        name: candidate.name,
        logoUrl: logos.get(candidate.id.toLowerCase()),
        countryCode: candidate.countryCode,
        providerId: "iptv-org",
        providerName: "Built-in EPG",
      }));

      // Custom guides remain manually searchable, but never displace the
      // built-in matcher suggestions that the automatic matcher would use.
      const custom = rankEpgMatches(
        customRows.map((row) => ({
          xmltvId: row.xmltvId,
          name: row.name,
          logoUrl: row.logoUrl ?? undefined,
          providerId: `custom:${row.sourceId}`,
          providerName: row.sourceName,
        })),
        query,
        limit,
      ) as Match[];
      const seen = new Set<string>();
      const results = [...builtin, ...custom]
        .filter((match) => {
          const key = match.xmltvId.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, limit);
      return NextResponse.json({ results }, {
        headers: {
          // Results can include a user's custom EPG source, so this authenticated
          // search response must never be shared through the CDN.
          "Cache-Control": "private, no-store",
        },
      });
    }

    const ids = params.get("sourceIds")?.split(",").map(Number).filter(Number.isInteger) ?? [];
    if (ids.length) {
      const user = await requireUser();
      if (user instanceof NextResponse) return user;
      return NextResponse.json({
        builtin: await getEpgChannels(),
        custom: await getUserEpgChannelMaps(user.id, ids),
      });
    }

    // The channel directory is public and identical for every user, and only
    // changes when someone refreshes it from Settings -> EPG. Let the CDN serve
    // it so a ~28k-row read doesn't run against Postgres on every page load.
    const channels = await getEpgChannels();
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
