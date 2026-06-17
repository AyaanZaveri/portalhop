import { NextResponse } from "next/server";
import { EPG_SOURCES } from "@/lib/epg-sources";
import { fetchAndParseEpg } from "@/lib/epg-parser";
import { saveEpgChannels, saveEpgManifest, getEpgManifest } from "@/lib/epg-store";

export async function GET() {
  try {
    const manifest = await getEpgManifest();
    return NextResponse.json(manifest);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const activeCountries: { code: string; count: number }[] = [];

    // Helper to process a source
    const processSource = async (source: typeof EPG_SOURCES[0]) => {
      console.log(`Fetching EPG for ${source.name} (${source.code})...`);
      try {
        const channels = await fetchAndParseEpg(source.url);
        if (channels.length > 0) {
          await saveEpgChannels(source.code, channels);
          activeCountries.push({
            code: source.code,
            count: channels.length,
          });
        }
        console.log(`Success ${source.name}: ${channels.length} channels`);
      } catch (err) {
        console.error(`Failed to fetch/parse EPG for ${source.name}:`, err);
      }
    };

    // Process sources 3-at-a-time
    const limit = 3;
    const items = [...EPG_SOURCES];
    const promises: Promise<void>[] = [];
    let index = 0;

    const runNext = async (): Promise<void> => {
      if (index >= items.length) return;
      const currentIndex = index++;
      const item = items[currentIndex];
      await processSource(item);
      await runNext();
    };

    for (let i = 0; i < Math.min(limit, items.length); i++) {
      promises.push(runNext());
    }

    await Promise.all(promises);

    // Sort active countries by code alphabetically
    activeCountries.sort((a, b) => a.code.localeCompare(b.code));

    const manifest = {
      lastFetchedAt: Date.now(),
      countries: activeCountries,
    };

    await saveEpgManifest(manifest);

    return NextResponse.json(manifest);
  } catch (error: unknown) {
    console.error("EPG Refetch failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
