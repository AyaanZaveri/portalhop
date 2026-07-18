import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { insertSavedChannels } from "@/db/saved-channels"
import { selectSavedSource } from "@/db/saved-sources"
import { savedChannels, savedSources, savedStalkerSources } from "@/db/schema"
import { requireUser } from "@/lib/session"
import { fetchChannelsForPortal } from "@/lib/portal-fetch"

export const runtime = "nodejs"

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const { id } = await context.params
  const sourceId = Number(id)

  if (!Number.isInteger(sourceId)) {
    return NextResponse.json({ error: "Invalid source id." }, { status: 400 })
  }

  const db = getDb()
  const portal = await selectSavedSource(db, sourceId)

  if (!portal || portal.userId !== user.id) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  let result
  try {
    result = await fetchChannelsForPortal(portal)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not refetch this source.",
      },
      { status: 502 }
    )
  }

  const now = new Date()

  await db.transaction(async (tx) => {
    await tx.delete(savedChannels).where(eq(savedChannels.sourceId, portal.id))

    if (result.channels.length) {
      await insertSavedChannels(tx, portal.id, result.channels, now)
    }

    await tx
      .update(savedSources)
      .set({ channelCount: result.channels.length, updatedAt: now })
      .where(eq(savedSources.id, portal.id))

    if (portal.sourceType === "stalker") {
      await tx
        .update(savedStalkerSources)
        .set({ endpoint: result.endpoint })
        .where(eq(savedStalkerSources.sourceId, portal.id))
    }
  })

  return NextResponse.json({
    portal: {
      ...portal,
      endpoint: result.endpoint,
      channelCount: result.channels.length,
      updatedAt: now,
    },
    result,
  })
}
