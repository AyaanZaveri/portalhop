import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import {
  ensureFavoritesToken,
  regenerateFavoritesToken,
} from "@/db/favorites-token"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

function playlistUrl(request: Request, token: string) {
  return new URL(`/api/favorites/${token}/playlist`, request.url).href
}

/** Returns the user's favorites-playlist URL, creating a token if needed. */
export async function GET(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const token = await ensureFavoritesToken(getDb(), user.id)

  return NextResponse.json({ token, url: playlistUrl(request, token) })
}

/** Rotates the token, invalidating any previously shared playlist URL. */
export async function POST(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const token = await regenerateFavoritesToken(getDb(), user.id)

  return NextResponse.json({ token, url: playlistUrl(request, token) })
}
