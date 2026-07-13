import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import {
  applyXmltvIdUpdates,
  selectSavedChannelRows,
} from "@/db/saved-channels"
import { selectSavedSource } from "@/db/saved-sources"
import {
  buildEpgIndex,
  classifyMatch,
  nameKeys,
  pickRegional,
  regionOf,
  type EpgChannelEntry,
  type MatchCandidate,
} from "@/lib/channel-matcher"
import {
  rerankBatch,
  type EnrichAiSettings,
  type RerankItem,
} from "@/lib/channel-enrich-ai"
import { getEpgChannels } from "@/lib/epg-store"

export const runtime = "nodejs"
export const maxDuration = 800

const AI_BATCH_SIZE = 30

interface EnrichRequest {
  settings?: EnrichAiSettings
  /** Re-match every channel, including ones that already have a valid id. */
  force?: boolean
}

type ProgressLine =
  | { type: "progress"; stage: "scan" | "exact" | "ai"; processed: number; total: number; matched: number }
  | {
      type: "match"
      name: string
      xmltvId: string
      logoUrl: string
      matched: number
      processed: number
      total: number
    }
  | {
      type: "done"
      total: number
      needing: number
      matched: number
      exact: number
      aiResolved: number
      aiCalls: number
      aiFailed: number
      aiAvailable: boolean
      aiError: string | null
    }
  | { type: "error"; error: string }

/** The most aggressively normalized key, used to dedup near-identical names. */
function dedupKey(raw: string): string {
  const keys = nameKeys(raw)
  return keys.length ? keys[keys.length - 1] : ""
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const sourceId = Number(id)

  if (!Number.isInteger(sourceId)) {
    return NextResponse.json({ error: "Invalid source id." }, { status: 400 })
  }

  let body: EnrichRequest = {}
  try {
    body = (await request.json()) as EnrichRequest
  } catch {
    body = {}
  }

  const db = getDb()
  const portal = await selectSavedSource(db, sourceId)

  if (!portal) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  const epgChannels = (await getEpgChannels()) as Record<string, EpgChannelEntry>
  if (!epgChannels || Object.keys(epgChannels).length === 0) {
    return NextResponse.json(
      { error: "No EPG data loaded. Refresh EPG in settings first." },
      { status: 400 }
    )
  }

  const settings = body.settings
  const aiAvailable = Boolean(
    (settings?.baseUrl || process.env.AI_BASE_URL) &&
      settings?.model?.trim()
  )

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: ProgressLine) => {
        controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"))
      }

      try {
        const index = buildEpgIndex(epgChannels)
        const rows = await selectSavedChannelRows(sourceId)

        // Group the rows that still need a valid id by their dedup key.
        const groups = new Map<
          string,
          { sampleName: string; rowIds: number[] }
        >()

        for (const row of rows) {
          const hasValidId =
            row.xmltvId.trim().length > 0 &&
            index.knownIds.has(row.xmltvId.toLowerCase())

          if (hasValidId && !body.force) {
            continue
          }

          const key = dedupKey(row.name)
          if (!key) {
            continue
          }

          const group = groups.get(key)
          if (group) {
            group.rowIds.push(row.id)
          } else {
            groups.set(key, { sampleName: row.name, rowIds: [row.id] })
          }
        }

        const uniqueNames = [...groups.entries()]
        const total = uniqueNames.length
        send({ type: "progress", stage: "scan", processed: 0, total, matched: 0 })

        const assignments = new Map<string, string>() // dedupKey -> xmltvId

        // Emit a live "matched" event as each name is resolved so the client
        // can show the channel and its new logo.
        let matchedNames = 0
        const logoFor = (xmltvId: string) =>
          epgChannels[xmltvId.toLowerCase()]?.logoUrl ?? ""
        const emitMatch = (name: string, xmltvId: string, processed: number) => {
          matchedNames += 1
          send({
            type: "match",
            name,
            xmltvId,
            logoUrl: logoFor(xmltvId),
            matched: matchedNames,
            processed,
            total,
          })
        }

        // Tier 1 + 2: deterministic exact / regional / ambiguous split.
        const regional: {
          key: string
          sampleName: string
          candidates: MatchCandidate[]
        }[] = []
        const ambiguous: { key: string; sampleName: string }[] = []
        const regionTally = new Map<string, number>()

        let processed = 0
        for (const [key, group] of uniqueNames) {
          if (request.signal.aborted) {
            break
          }
          processed += 1
          const match = classifyMatch(group.sampleName, index)
          if (match.kind === "exact") {
            assignments.set(key, match.xmltvId)
            const region = regionOf(match.xmltvId)
            if (region) {
              regionTally.set(region, (regionTally.get(region) ?? 0) + 1)
            }
            emitMatch(group.sampleName, match.xmltvId, processed)
          } else if (match.kind === "regional") {
            regional.push({ key, sampleName: group.sampleName, candidates: match.candidates })
          } else if (match.kind === "ambiguous") {
            ambiguous.push({ key, sampleName: group.sampleName })
          }

          // Yield periodically so the stream flushes to the client live.
          if (processed % 200 === 0) {
            send({ type: "progress", stage: "exact", processed, total, matched: matchedNames })
            await new Promise((resolve) => setTimeout(resolve, 0))
          }
        }

        // The source's dominant region breaks ties for same-channel regional
        // variants (logos are region-identical, so this is token-free).
        let regionHint = ""
        let bestTally = 0
        for (const [region, count] of regionTally) {
          if (count > bestTally) {
            bestTally = count
            regionHint = region
          }
        }

        for (const entry of regional) {
          const xmltvId = pickRegional(entry.candidates, regionHint)
          if (xmltvId) {
            assignments.set(entry.key, xmltvId)
            emitMatch(entry.sampleName, xmltvId, total)
          }
        }

        const exactCount = assignments.size
        send({ type: "progress", stage: "exact", processed: total, total, matched: matchedNames })

        // Tier 3: AI rerank every ambiguous name (only if a provider is set).
        let aiResolved = 0
        let aiCalls = 0
        let aiFailed = 0
        let aiError: string | null = null

        if (aiAvailable && ambiguous.length) {
          for (let start = 0; start < ambiguous.length; start += AI_BATCH_SIZE) {
            if (request.signal.aborted) {
              break
            }

            const slice = ambiguous.slice(start, start + AI_BATCH_SIZE)
            const items: RerankItem[] = slice.map((entry, offset) => {
              const match = classifyMatch(entry.sampleName, index)
              const candidates =
                match.kind === "ambiguous" ? match.candidates : []
              return { key: start + offset, name: entry.sampleName, candidates }
            })

            try {
              const picks = await rerankBatch(items, settings ?? {})
              aiCalls += 1
              for (const [itemKey, xmltvId] of picks) {
                const entry = ambiguous[itemKey]
                if (entry) {
                  assignments.set(entry.key, xmltvId)
                  aiResolved += 1
                  emitMatch(
                    entry.sampleName,
                    xmltvId,
                    Math.min(start + AI_BATCH_SIZE, ambiguous.length)
                  )
                }
              }
            } catch (err) {
              // Skip this batch on provider error; keep deterministic matches.
              aiCalls += 1
              aiFailed += 1
              if (!aiError) {
                aiError = err instanceof Error ? err.message : "AI provider error"
              }
            }

            send({
              type: "progress",
              stage: "ai",
              processed: Math.min(start + AI_BATCH_SIZE, ambiguous.length),
              total: ambiguous.length,
              matched: matchedNames,
            })
          }
        }

        // Fan assignments back out to every row in each group and persist.
        const updates: { id: number; xmltvId: string }[] = []
        for (const [key, xmltvId] of assignments) {
          const group = groups.get(key)
          if (!group) {
            continue
          }
          for (const rowId of group.rowIds) {
            updates.push({ id: rowId, xmltvId })
          }
        }

        const matchedRows = await applyXmltvIdUpdates(updates)

        send({
          type: "done",
          total: rows.length,
          needing: total,
          matched: matchedRows,
          exact: exactCount,
          aiResolved,
          aiCalls,
          aiFailed,
          aiAvailable,
          aiError,
        })
      } catch (error) {
        send({
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "Could not enrich channel ids.",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  })
}
