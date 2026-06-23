import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    envBaseUrl: process.env.AI_BASE_URL ?? null,
    envApiKey: process.env.AI_API_KEY ? true : false,
  })
}
