import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "epg");

export interface EpgManifest {
  lastFetchedAt: number | null;
  countries: {
    code: string;
    count: number;
  }[];
}

export async function ensureEpgDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function saveEpgChannels(countryCode: string, channels: import("./epg-parser").EpgChannel[]) {
  await ensureEpgDir();
  const filePath = path.join(DATA_DIR, `${countryCode.toLowerCase()}.json`);
  await fs.writeFile(filePath, JSON.stringify(channels, null, 2), "utf-8");
}

export async function saveEpgManifest(manifest: EpgManifest) {
  await ensureEpgDir();
  const filePath = path.join(DATA_DIR, "manifest.json");
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), "utf-8");
}

export async function getEpgManifest(): Promise<EpgManifest> {
  await ensureEpgDir();
  const filePath = path.join(DATA_DIR, "manifest.json");
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return { lastFetchedAt: null, countries: [] };
  }
}

export async function getEpgChannels(): Promise<Record<string, { name: string; logoUrl?: string }>> {
  await ensureEpgDir();
  const manifest = await getEpgManifest();
  const merged: Record<string, { name: string; logoUrl?: string }> = {};

  for (const country of manifest.countries) {
    const filePath = path.join(DATA_DIR, `${country.code.toLowerCase()}.json`);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const channels = JSON.parse(data);
      for (const ch of channels) {
        merged[ch.id.toLowerCase()] = {
          name: ch.name,
          logoUrl: ch.logoUrl,
        };
      }
    } catch (e: unknown) {
      console.error(`Failed to read EPG file for ${country.code}:`, e instanceof Error ? e.message : String(e));
    }
  }

  return merged;
}

export async function isEpgStale(): Promise<boolean> {
  const manifest = await getEpgManifest();
  if (!manifest.lastFetchedAt) return true;
  const sixHoursMs = 6 * 60 * 60 * 1000;
  return Date.now() - manifest.lastFetchedAt > sixHoursMs;
}
