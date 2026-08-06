import { NextResponse } from "next/server";
import { EPG_SOURCES } from "@portalhop/shared/epg-sources";
import { fetchAndParseEpg } from "@/lib/epg-parser";
import { saveEpgChannels, getEpgManifest } from "@/lib/epg-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const manifest = await getEpgManifest();
    return NextResponse.json(manifest);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Refreshes a single country, given `{ code: "US" }`.
 *
 * Deliberately scoped to one country per request: fetching and gunzipping all
 * ~78 XMLTV feeds takes minutes and cannot fit in a serverless function's
 * timeout. Callers drive the full refresh by looping over EPG_SOURCES, which
 * also gives them real progress to display.
 */
export async function POST(request: Request) {
  let code: string;

  try {
    const body = await request.json();
    code = String(body?.code ?? "").trim().toUpperCase();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json(
      { error: "A country code is required." },
      { status: 400 }
    );
  }

  const source = EPG_SOURCES.find((item) => item.code.toUpperCase() === code);

  if (!source) {
    return NextResponse.json(
      { error: `Unknown EPG country code: ${code}` },
      { status: 404 }
    );
  }

  try {
    const channels = await fetchAndParseEpg(source.url);

    if (!channels.length) {
      return NextResponse.json(
        { error: `${source.name} returned no channels.` },
        { status: 502 }
      );
    }

    const count = await saveEpgChannels(source.code, channels);

    return NextResponse.json({ code: source.code, name: source.name, count });
  } catch (error: unknown) {
    console.error(`EPG refresh failed for ${source.name}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
