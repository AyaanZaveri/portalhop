import { NextResponse } from "next/server";
import { getEpgChannels } from "@/lib/epg-store";

export async function GET() {
  try {
    const channels = await getEpgChannels();
    return NextResponse.json(channels);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
