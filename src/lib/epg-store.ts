import { desc, eq, inArray, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import { epgChannels, epgCountries } from "@/db/schema";
import type { NewEpgChannelRow } from "@/db/schema";
import { EPG_SOURCES } from "@portalhop/shared/epg-sources";
import type { EpgChannel } from "@/lib/epg-parser";
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id";
import { stripCountryPrefix } from "@portalhop/shared/epg-search";

export interface EpgManifest {
  lastFetchedAt: number | null;
  countries: {
    code: string;
    count: number;
  }[];
}

// Postgres caps a statement at 65535 bind params; each row binds 6 columns, so
// stay well under that per insert.
const INSERT_CHUNK_SIZE = 1000;

export async function saveEpgChannels(
  countryCode: string,
  channels: EpgChannel[]
) {
  const db = getDb();
  const code = countryCode.toUpperCase();
  const fetchedAt = new Date();

  // A single XMLTV file can repeat a channel id; the composite primary key
  // would reject the batch, so keep the first occurrence of each.
  const deduped = new Map<string, EpgChannel>();
  for (const channel of channels) {
    if (channel.id && !deduped.has(channel.id)) {
      deduped.set(channel.id, channel);
    }
  }

  const rows: NewEpgChannelRow[] = [...deduped.values()].map((channel) => ({
    countryCode: code,
    channelId: channel.id,
    name: channel.name,
    logoUrl: channel.logoUrl ?? null,
    channelIdLower: channel.id.trim().toLowerCase(),
    nameNormalized: normalizeChannelName(channel.name),
  }));

  await db.transaction(async (tx) => {
    await tx
      .insert(epgCountries)
      .values({ code, channelCount: rows.length, fetchedAt })
      .onConflictDoUpdate({
        target: epgCountries.code,
        set: { channelCount: rows.length, fetchedAt },
      });

    // Replace the country wholesale so channels dropped upstream disappear here.
    await tx.delete(epgChannels).where(eq(epgChannels.countryCode, code));

    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      await tx.insert(epgChannels).values(rows.slice(i, i + INSERT_CHUNK_SIZE));
    }
  });

  return rows.length;
}

export async function getEpgManifest(): Promise<EpgManifest> {
  const db = getDb();
  const rows = await db
    .select()
    .from(epgCountries)
    .orderBy(desc(epgCountries.fetchedAt));

  if (!rows.length) {
    return { lastFetchedAt: null, countries: [] };
  }

  // Countries refresh independently now, so "last updated" is the most recent
  // country refresh rather than the end of one big all-countries run.
  const lastFetchedAt = rows[0].fetchedAt.getTime();

  return {
    lastFetchedAt,
    countries: rows
      .map((row) => ({ code: row.code, count: row.channelCount }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}

export async function getEpgChannels(): Promise<
  Record<string, { name: string; logoUrl?: string; countryCode: string }>
> {
  const db = getDb();
  const rows = await db
    .select({
      channelIdLower: epgChannels.channelIdLower,
      name: epgChannels.name,
      logoUrl: epgChannels.logoUrl,
      countryCode: epgChannels.countryCode,
    })
    .from(epgChannels);

  const merged: Record<
    string,
    { name: string; logoUrl?: string; countryCode: string }
  > = {};

  for (const row of rows) {
    merged[row.channelIdLower] = {
      name: row.name,
      logoUrl: row.logoUrl ?? undefined,
      countryCode: row.countryCode,
    };
  }

  return merged;
}

/**
 * Guide names for a set of channels, country prefix already removed.
 *
 * Unlike the logo lookup below, this is not gated on a source's epgMode. A
 * portal's name for a channel is whatever its operator typed — "TSN 1 - NO
 * EVENT TODAY", "4K| SKY SPORTS F1 UHD" — and once a row stands for several
 * portals there is no reason to prefer one of those over the directory, which
 * names the channel the same way for everybody. Which feed supplies programmes
 * is a separate question from what the channel is called.
 *
 * Batched the same way and for the same reason: a large portal would otherwise
 * blow past Postgres' bind-parameter cap.
 */
export async function getEpgChannelNames(channelIds: string[]) {
  const ids = [...new Set(channelIds.map(normalizeXmltvId).filter(Boolean))]
  const result: Record<string, string> = {}

  for (let index = 0; index < ids.length; index += 2_000) {
    const rows = await getDb()
      .select({
        channelIdLower: epgChannels.channelIdLower,
        name: epgChannels.name,
      })
      .from(epgChannels)
      .where(inArray(epgChannels.channelIdLower, ids.slice(index, index + 2_000)))

    for (const row of rows) {
      const stripped = stripCountryPrefix(row.name)
      if (stripped) result[row.channelIdLower] = stripped
    }
  }

  return result
}

/** Returns logo metadata only for channel ids the UI is actually displaying. */
export async function getEpgChannelLogos(channelIds: string[]) {
  const ids = [...new Set(channelIds.map(normalizeXmltvId).filter(Boolean))]
  const result: Record<string, { logoUrl?: string; countryCode: string }> = {}

  // Keep SQL bind counts comfortable for large portals.
  for (let index = 0; index < ids.length; index += 2_000) {
    const rows = await getDb()
      .select({
        channelIdLower: epgChannels.channelIdLower,
        logoUrl: epgChannels.logoUrl,
        countryCode: epgChannels.countryCode,
      })
      .from(epgChannels)
      .where(inArray(epgChannels.channelIdLower, ids.slice(index, index + 2_000)))

    for (const row of rows) {
      result[row.channelIdLower] = {
        logoUrl: row.logoUrl ?? undefined,
        countryCode: row.countryCode,
      }
    }
  }

  return result
}

export async function findEpgSourceForChannel(
  candidates: { id?: string; name?: string }[]
) {
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const candidate of candidates) {
    const id = normalizeXmltvId(candidate.id);
    const name = normalizeChannelName(candidate.name ?? "");
    if (id) ids.add(id);
    if (name) names.add(name);
  }

  if (!ids.size && !names.size) {
    return null;
  }

  const db = getDb();
  const filters = [
    ids.size ? inArray(epgChannels.channelIdLower, [...ids]) : undefined,
    names.size ? inArray(epgChannels.nameNormalized, [...names]) : undefined,
  ].filter((filter) => filter !== undefined);

  const matches = await db
    .select({
      channelId: epgChannels.channelId,
      channelIdLower: epgChannels.channelIdLower,
      countryCode: epgChannels.countryCode,
    })
    .from(epgChannels)
    .where(filters.length === 1 ? filters[0] : or(...filters))
    .limit(50);

  if (!matches.length) {
    return null;
  }

  // An id match is exact; a name match is fuzzy. Prefer the former.
  const best =
    matches.find((match) => ids.has(match.channelIdLower)) ?? matches[0];

  const source = EPG_SOURCES.find(
    (item) => item.code.toLowerCase() === best.countryCode.toLowerCase()
  );

  if (!source) {
    return null;
  }

  return { source, channelId: best.channelId };
}

function normalizeChannelName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(hd|fhd|uhd|4k|sd|cc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
