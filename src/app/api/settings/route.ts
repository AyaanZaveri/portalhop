import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { getUserSettings, updateUserSettings } from "@/db/user-settings"
import { requireUser } from "@/lib/session"
import { sanitizeSettingsPatch } from "@portalhop/shared/user-settings"

export const runtime = "nodejs"

export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const settings = await getUserSettings(getDb(), user.id)
  return NextResponse.json({ settings })
}

export async function PATCH(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const body = await request.json().catch(() => null)
  const patch = sanitizeSettingsPatch(body)

  const settings = await updateUserSettings(getDb(), user.id, patch)
  return NextResponse.json({ settings })
}
