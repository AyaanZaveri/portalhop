import { desc, eq, inArray, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import { epgChannels, epgCountries } from "@/db/schema";
import type { NewEpgChannelRow } from "@/db/schema";
import { EPG_SOURCES } from "@/lib/epg-sources";
import type { EpgChannel } from "@/lib/epg-parser";

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

export async function findEpgSourceForChannel(
  candidates: { id?: string; name?: string }[]
) {
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const candidate of candidates) {
    const id = candidate.id?.trim().toLowerCase();
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
