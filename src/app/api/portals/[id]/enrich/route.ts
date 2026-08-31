import { NextResponse } from "next/server"
import pc from "picocolors"

import { getDb } from "@/db/client"
import {
  applyXmltvIdUpdates,
  selectSavedChannelRows,
} from "@/db/saved-channels"
import { selectSavedSource, touchSavedSource } from "@/db/saved-sources"
import { requireUser } from "@/lib/session"
import {
  buildEpgIndex,
  classifyMatch,
  nameKeys,
  normalizeName,
  pickRegional,
  regionOf,
  type MatchCandidate,
} from "@/lib/channel-matcher"
import {
  rerankBatch,
  type EnrichAiSettings,
  type RerankItem,
} from "@/lib/channel-enrich-ai"
import { getIptvEpgChannelDirectory } from "@/lib/iptv-epg-channel-directory"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import { resolveCategoryVisual } from "@portalhop/shared/category-flags"

export const runtime = "nodejs"
export const maxDuration = 300

// Keep batches below the point where the model loses attention, then recover
// wall-clock time through concurrency. The candidate guard keeps impossible
// numbered variants out of this path, so 30 is still compact while requiring
// materially fewer network round trips than the old 20-item batches.
const AI_BATCH_SIZE = 30
const configuredAiConcurrency = Number(process.env.AI_MATCH_CONCURRENCY)
const AI_BATCH_CONCURRENCY = Number.isInteger(configuredAiConcurrency)
  ? Math.min(Math.max(configuredAiConcurrency, 1), 48)
  : 24

// These describe presentation or distribution, not the broadcaster. They do
// not provide useful regional evidence for another channel with the same name.
const COUNTRY_EVIDENCE_IGNORED_TOKENS = new Set([
  "tv",
  "real",
  "live",
  "channel",
  "network",
  "east",
  "west",
  "north",
  "south",
  "central",
  "pacific",
  "ontario",
  "sports",
])

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
      cleared: number
    }
  | { type: "error"; error: string }

/** The most aggressively normalized key, used to dedup near-identical names. */
function dedupKey(raw: string): string {
  const keys = nameKeys(raw)
  return keys.length ? keys[keys.length - 1] : ""
}

function broadcasterTokens(name: string) {
  return [...new Set(normalizeName(name).split(" "))].filter(
    (token) =>
      token.length > 1 &&
      !/^\d+$/.test(token) &&
      !COUNTRY_EVIDENCE_IGNORED_TOKENS.has(token)
  )
}

type CountryEvidence = Map<string, Map<string, number>>

function recordCountryEvidence(
  evidence: CountryEvidence,
  name: string,
  xmltvId: string
) {
  const country = regionOf(xmltvId)
  if (!country) return

  for (const token of broadcasterTokens(name)) {
    const votes = evidence.get(token) ?? new Map<string, number>()
    votes.set(country, (votes.get(country) ?? 0) + 1)
    evidence.set(token, votes)
  }
}

function strongestCountry(
  votes: Map<string, number> | undefined
): { country: string; count: number } | null {
  if (!votes?.size) return null
  const ranked = [...votes.entries()].sort(
    ([aCountry, aCount], [bCountry, bCount]) =>
      bCount - aCount || aCountry.localeCompare(bCountry)
  )
  const [country, count] = ranked[0]
  const runnerUp = ranked[1]?.[1] ?? 0
  return count > runnerUp ? { country, count } : null
}

function contextualCountryFor(
  name: string,
  candidates: MatchCandidate[],
  evidence: CountryEvidence
) {
  const candidateCountries = new Set(
    candidates.map((candidate) => candidate.countryCode?.toLowerCase()).filter(Boolean)
  )
  const countryScores = new Map<string, number>()

  for (const token of broadcasterTokens(name)) {
    for (const [country, count] of evidence.get(token) ?? []) {
      if (candidateCountries.has(country)) {
        countryScores.set(country, (countryScores.get(country) ?? 0) + count)
      }
    }
  }

  return strongestCountry(countryScores)?.country ?? ""
}

function sourceContextFor(name: string, evidence: CountryEvidence) {
  const hints = broadcasterTokens(name)
    .map((token) => ({ token, match: strongestCountry(evidence.get(token)) }))
    .filter(
      (hint): hint is { token: string; match: { country: string; count: number } } =>
        Boolean(hint.match)
    )
    .sort((a, b) => b.match.count - a.match.count || a.token.localeCompare(b.token))
    .slice(0, 3)
    .map((hint) => `${hint.token.toUpperCase()} → ${hint.match.country.toUpperCase()} (${hint.match.count})`)

  return hints.length ? `verified broadcaster country evidence: ${hints.join(", ")}` : ""
}

/**
 * A channel's own category wins over any portal-wide guess: `UK | SPORTS` is
 * direct evidence for a UK candidate, while a portal may intentionally carry
 * channels from many regions. Only accept a category flag when it distinguishes
 * one of the candidates; generic categories such as `SPORTS` return nothing.
 */
function categoryCountryFor(
  categories: Iterable<string>,
  candidates: MatchCandidate[],
) {
  const candidateCountries = new Set(
    candidates.map((candidate) => candidate.countryCode?.toLowerCase()).filter(Boolean),
  )
  const votes = new Map<string, number>()

  for (const category of categories) {
    const visual = resolveCategoryVisual(category)
    if (visual?.kind !== "flag" || !candidateCountries.has(visual.code)) continue
    votes.set(visual.code, (votes.get(visual.code) ?? 0) + 1)
  }

  return strongestCountry(votes)?.country ?? ""
}

export async function POST(
  request: Request,
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

  let body: EnrichRequest = {}
  try {
    body = (await request.json()) as EnrichRequest
  } catch {
    body = {}
  }

  const db = getDb()
  const portal = await selectSavedSource(db, sourceId)

  if (!portal || portal.userId !== user.id) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  const epgChannels = await getIptvEpgChannelDirectory()
  if (!epgChannels || Object.keys(epgChannels).length === 0) {
    return NextResponse.json(
      { error: "IPTV-EPG channel directory is unavailable. Try again shortly." },
      { status: 502 }
    )
  }

  const settings = body.settings
  const aiBaseUrl = settings?.baseUrl || process.env.AI_BASE_URL || ""
  const aiApiKey = settings?.apiKey || process.env.AI_API_KEY || ""
  const aiModel = settings?.model?.trim() || process.env.AI_MODEL?.trim() || ""
  const aiCredentialSource = settings?.baseUrl || settings?.apiKey
    ? "AI Provider settings"
    : ".env"
  const missingAiSettings = [
    !aiBaseUrl && "base URL",
    !aiApiKey && "API key",
    !aiModel && "model",
  ].filter(Boolean)
  const aiAvailable = missingAiSettings.length === 0

  console.log(
    aiAvailable
      ? pc.green(
          `[XMLTV] ${portal.name}: AI reranking enabled from ${aiCredentialSource} (${AI_BATCH_SIZE} channels/request, ${AI_BATCH_CONCURRENCY} concurrent requests)`
        )
      : pc.yellow(
          `[XMLTV] ${portal.name}: AI reranking disabled, missing ${missingAiSettings.join(", ")}`
        )
  )

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Do not return the matching promise from start(). Web Streams await an
      // async start hook before exposing the response, which previously meant
      // a long enrich looked like a hung request and none of its progress
      // lines reached the client until every AI batch had completed.
      void (async () => {
        const send = (line: ProgressLine) => {
          controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"))
        }

        try {
          const index = buildEpgIndex(epgChannels)
          const rows = await selectSavedChannelRows(sourceId)

        // Group the rows that still need a valid id by their dedup key.
        const groups = new Map<
          string,
          {
            sampleName: string
            rowIds: number[]
            existingXmltvIds: string[]
            categories: Set<string>
          }
        >()

        for (const row of rows) {
          // Some portals append a quality/language tag to their xmltv ids
          // (e.g. "TSN1.ca@SD") that never appears in real EPG data. Strip
          // it before checking validity so these rows aren't needlessly
          // re-matched, and so the clean id gets written back below.
          const normalizedId = normalizeXmltvId(row.xmltvId)
          const hasValidId = normalizedId.length > 0 && index.knownIds.has(normalizedId)

          if (hasValidId && !body.force) {
            continue
          }

          const key = dedupKey(row.name)
          // A nameless row cannot be matched, but is still included so a
          // full reconciliation never drops an existing valid XMLTV id.
          const groupKey = key || `row-${row.id}`
          const existingXmltvId = hasValidId ? normalizedId : ""

          const group = groups.get(groupKey)
          if (group) {
            group.rowIds.push(row.id)
            if (row.genre) group.categories.add(row.genre)
            if (
              existingXmltvId &&
              !group.existingXmltvIds.includes(existingXmltvId)
            ) {
              group.existingXmltvIds.push(existingXmltvId)
            }
          } else {
            groups.set(groupKey, {
              sampleName: row.name,
              rowIds: [row.id],
              existingXmltvIds: existingXmltvId ? [existingXmltvId] : [],
              categories: new Set(row.genre ? [row.genre] : []),
            })
          }
        }

        const uniqueNames = [...groups.entries()]
        const total = uniqueNames.length
        send({ type: "progress", stage: "scan", processed: 0, total, matched: 0 })

        const assignments = new Map<string, string>() // dedupKey -> xmltvId

        // Match events are emitted only after a database batch commits. This
        // keeps the UI's update count truthful instead of showing provisional
        // classifier results as if they had already been written.
        let matchedNames = 0
        const logoFor = (xmltvId: string) =>
          epgChannels[xmltvId.toLowerCase()]?.logoUrl ?? ""

        // Tier 1 + 2: deterministic exact / regional / ambiguous split.
        const regional: {
          key: string
          sampleName: string
          candidates: MatchCandidate[]
          categories: Set<string>
        }[] = []
        const ambiguous: {
          key: string
          sampleName: string
          candidates: MatchCandidate[]
          currentXmltvId?: string
          categories: Set<string>
        }[] = []
        const countryEvidence: CountryEvidence = new Map()

        let processed = 0
        for (const [key, group] of uniqueNames) {
          if (request.signal.aborted) {
            break
          }
          processed += 1
          const match = classifyMatch(group.sampleName, index)
          const currentXmltvId = group.existingXmltvIds[0]
          if (match.kind === "exact") {
            assignments.set(key, match.xmltvId)
            recordCountryEvidence(countryEvidence, group.sampleName, match.xmltvId)
          } else if (match.kind === "regional") {
            regional.push({
              key,
              sampleName: group.sampleName,
              candidates: match.candidates,
              categories: group.categories,
            })
          } else if (match.kind === "ambiguous") {
            const candidates = [...match.candidates]
            if (
              currentXmltvId &&
              !candidates.some(
                (candidate) =>
                  candidate.id.toLowerCase() === currentXmltvId.toLowerCase(),
              )
            ) {
              candidates.unshift({
                id: currentXmltvId,
                name:
                  epgChannels[currentXmltvId.toLowerCase()]?.name ??
                  currentXmltvId,
                score: 1,
                countryCode:
                  epgChannels[currentXmltvId.toLowerCase()]?.countryCode,
              })
            }
            ambiguous.push({
              key,
              sampleName: group.sampleName,
              candidates,
              currentXmltvId,
              categories: group.categories,
            })
          } else if (currentXmltvId && !body.force) {
            // No viable new candidate: retain a currently valid IPTV-EPG.org id.
            assignments.set(key, currentXmltvId)
          }

          // Yield periodically so the stream flushes to the client live.
          if (processed % 200 === 0) {
            send({ type: "progress", stage: "exact", processed, total, matched: matchedNames })
            await new Promise((resolve) => setTimeout(resolve, 0))
          }
        }

        for (const entry of regional) {
          const categoryCountry = categoryCountryFor(
            entry.categories,
            entry.candidates,
          )
          const contextualCountry = contextualCountryFor(
            entry.sampleName,
            entry.candidates,
            countryEvidence
          )
          const country = categoryCountry || contextualCountry
          if (!country) {
            // A regional tie without channel-local or broadcaster evidence is
            // exactly the judgement call the AI reranker is for. Do not choose
            // alphabetically merely because the portal has more of one region.
            ambiguous.push({
              key: entry.key,
              sampleName: entry.sampleName,
              candidates: entry.candidates,
              categories: entry.categories,
            })
            continue
          }
          const xmltvId = pickRegional(entry.candidates, country)
          if (xmltvId) {
            assignments.set(entry.key, xmltvId)
            recordCountryEvidence(countryEvidence, entry.sampleName, xmltvId)
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
          let nextBatchStart = 0
          let aiProcessed = 0

          const processBatch = async () => {
            while (!request.signal.aborted) {
              const start = nextBatchStart
              nextBatchStart += AI_BATCH_SIZE
              if (start >= ambiguous.length) {
                return
              }

              const slice = ambiguous.slice(start, start + AI_BATCH_SIZE)
              const items: RerankItem[] = slice.map((entry, offset) => ({
                key: start + offset,
                name: entry.sampleName,
                candidates: entry.candidates,
                currentXmltvId: entry.currentXmltvId,
                categoryContext: [...entry.categories].join(" | "),
                sourceContext: sourceContextFor(entry.sampleName, countryEvidence),
              }))

              try {
                const picks = await rerankBatch(items, settings ?? {})
                aiCalls += 1
                for (const [itemKey, xmltvId] of picks) {
                  const entry = ambiguous[itemKey]
                  if (entry) {
                    assignments.set(entry.key, xmltvId)
                    aiResolved += 1
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

              aiProcessed += slice.length
              send({
                type: "progress",
                stage: "ai",
                processed: aiProcessed,
                total: ambiguous.length,
                matched: matchedNames,
              })
            }
          }

          await Promise.all(
            Array.from(
              {
                length: Math.min(
                  AI_BATCH_CONCURRENCY,
                  Math.ceil(ambiguous.length / AI_BATCH_SIZE)
                ),
              },
              processBatch
            )
          )
        }

        // A normal pass preserves valid current IDs when an AI batch fails. A
        // forced reconciliation means "prove this match again": if no valid
        // candidate survives, clear the guessed id rather than preserving it.
        if (!body.force) {
          for (const entry of ambiguous) {
            if (!assignments.has(entry.key) && entry.currentXmltvId) {
              assignments.set(entry.key, entry.currentXmltvId)
            }
          }
        }

        // Fan assignments back out to every row in each group and persist.
        const updates: { id: number; xmltvId: string }[] = []
        for (const [key, group] of groups) {
          const xmltvId =
            assignments.get(key) ??
            (!body.force ? group.existingXmltvIds[0] ?? "" : "")
          // Reconciliation overwrites only with a verified candidate id. An
          // unmatchable name or an unavailable AI model must never clear an
          // existing mapping merely because this is a forced full pass.
          if (!xmltvId && !body.force) {
            continue
          }
          for (const rowId of group.rowIds) {
            updates.push({ id: rowId, xmltvId })
          }
        }

        const rowsById = new Map(rows.map((row) => [row.id, row]))
        const changedUpdates = updates.filter(
          (update) => rowsById.get(update.id)?.xmltvId !== update.xmltvId
        )

        const cleared = changedUpdates.filter((update) => !update.xmltvId).length
        console.log(
          pc.bold(
            pc.cyan(
              `[XMLTV] ${portal.name}: applying ${changedUpdates.length.toLocaleString()} changed mappings in 100-row batches`
            )
          )
        )

        await applyXmltvIdUpdates(changedUpdates, async (batch) => {
          for (const update of batch) {
            const row = rowsById.get(update.id)
            if (!row) {
              continue
            }
            const oldXmltvId = row.xmltvId || "∅"
            const newXmltvId = update.xmltvId || "∅"
            console.log(
              `${pc.dim("[XMLTV]")} ${pc.white(row.name)} ${pc.red(oldXmltvId)} ${pc.dim("→")} ${pc.green(newXmltvId)}`
            )
            matchedNames += 1
            send({
              type: "match",
              name: row.name,
              xmltvId: update.xmltvId,
              logoUrl: logoFor(update.xmltvId),
              matched: matchedNames,
              processed: matchedNames,
              total: changedUpdates.length,
            })
          }
        })

        if (changedUpdates.length) {
          // Rewrote saved_channels out-of-band, so bump the source's own
          // updatedAt so the client's IndexedDB channel cache invalidates
          // instead of continuing to serve the pre-enrich snapshot.
          await touchSavedSource(db, sourceId)
        }

        const matchedRows = changedUpdates.length - cleared

        if (aiAvailable) {
          console.log(
            pc.green(
              `[XMLTV] ${portal.name}: completed ${aiCalls} AI batch calls; ${aiResolved} channels resolved by AI; ${aiFailed} failed batches`
            )
          )
        }

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
          cleared,
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
      })()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  })
}
