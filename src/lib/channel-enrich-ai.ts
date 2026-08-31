import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText } from "ai"
import { z } from "zod"

import type { MatchCandidate } from "@/lib/channel-matcher"

export interface EnrichAiSettings {
  baseUrl?: string
  apiKey?: string
  model?: string
  reasoningEffort?: "none" | "low" | "medium" | "high" | "max"
}

/** One ambiguous channel handed to the reranker with its shortlisted ids. */
export type RerankItem = {
  key: number
  name: string
  candidates: MatchCandidate[]
  /** A valid existing IPTV-EPG.org id that should be retained unless replaced. */
  currentXmltvId?: string
  /** Verified country evidence for broadcaster tokens in this source. */
  sourceContext?: string
  /** The playlist category, often the strongest regional evidence. */
  categoryContext?: string
}

const rerankSchema = z.object({
  matches: z.array(
    z.object({
      key: z.number(),
      xmltvId: z.string(),
    })
  ),
})

const SYSTEM_PROMPT = `You match IPTV channel names to their canonical IPTV-EPG.org channel id.

You are given a list of channels. Each has a numeric "key", the channel "name" as it appears in the user's playlist, and a short list of candidate EPG channels (each with an "id" and "name"). For every channel, pick the id of the candidate that refers to the SAME television channel.

Rules:
- Choose only from the provided candidate ids for that channel. Never invent an id.
- If a current XMLTV id is supplied, keep it unless another listed candidate is clearly a better match.
- Match the actual broadcaster/feed, accounting for regional variants (e.g. "CNN" is not "CNN International" or "CNN en Español"), language, and country. Each candidate may state the country of the EPG source that supplied it; use that metadata to distinguish otherwise-identical names (for example, TSN is Canadian, not Maltese).
- A source-context line, when present, summarizes country evidence from already verified channels with the same broadcaster tokens. Treat it as strong evidence, but choose only a listed candidate and do not force an unrelated channel to fit it.
- A category line, when present, is the playlist's own regional/category label. Treat an explicit country there as stronger evidence than other channels in the portal.
- Ignore transport/presentation tags (HD, FHD, SD, frame rate, VIP, backup) and leading country/region prefixes when comparing. Keep 4K and UHD meaningful when they distinguish a named channel variant. A name may carry several leading tags (country, region, city, provider) separated by | - :, e.g. "CA | USA Border | Buffalo - NBC 2 | WGRZ"; ignore all of them. Treat the leading country code as unreliable: a US station resold on a foreign portal still carries a foreign tag.
- For a local broadcast station the call sign (3-4 letters such as WGRZ, WIVB, KDFX) identifies the channel; a small channel number like "NBC 2" or "CBS 4" does not. If a candidate's name contains the same call sign, choose that candidate.
- Distinguish base channels from numbered/named variants ("2", "Plus", "Overflow 2", "International", "Español", "Deportes" are different feeds); pick the exact one the name denotes.
- If none of the candidates is clearly the same channel, return an empty string for that key.
- Do not explain. Respond with only the JSON object matching the schema, of the form {"matches":[{"key":<number>,"xmltvId":"<id>"}]}.`

function formatItem(item: RerankItem): string {
  const candidates = item.candidates
    .map(
      (candidate) =>
        `    - ${candidate.id} [country: ${candidate.countryCode ?? "unknown"}] :: ${candidate.name}`
    )
    .join("\n")
  const current = item.currentXmltvId
    ? `\n  Current XMLTV id: ${item.currentXmltvId}`
    : ""
  const context = item.sourceContext ? `\n  Source context: ${item.sourceContext}` : ""
  const category = item.categoryContext ? `\n  Category: ${item.categoryContext}` : ""
  return `key ${item.key}: "${item.name}"${current}${category}${context}\n${candidates}`
}

/**
 * Ask the model to pick the best xmltv id for each ambiguous channel. Returns a
 * map of key → chosen xmltv id (only non-empty, valid-candidate choices). On
 * failure it throws, so callers can decide whether to skip the batch.
 */
export async function rerankBatch(
  items: RerankItem[],
  settings: EnrichAiSettings
): Promise<Map<number, string>> {
  const result = new Map<number, string>()
  if (!items.length) {
    return result
  }

  const apiKey = settings.apiKey || process.env.AI_API_KEY || ""
  const baseUrl = settings.baseUrl || process.env.AI_BASE_URL || ""
  const requestedModel = settings.model?.trim() || ""
  const envModel = process.env.AI_MODEL?.trim() || ""
  const model = requestedModel || envModel

  if (!baseUrl || !model) {
    throw new Error("AI provider is not configured.")
  }

  const provider = createOpenAICompatible({
    baseURL: baseUrl,
    apiKey,
    name: "custom",
    // Constrain generation to JSON object mode. Without it the model emits free
    // text and ~4% of batches came back as malformed JSON (mid-structure
    // truncation), silently dropping up to a batch of channels each. json_object
    // enables the provider's guided JSON decoding, so the grammar is valid by
    // construction; we still strip code fences and validate locally as a net.
    transformRequestBody: (body) => ({
      ...body,
      response_format: { type: "json_object" },
    }),
  })

  // Only forward reasoning_effort when it's a value providers accept. Some
  // (e.g. NVIDIA NIM) reject "none"/"max", so omit it otherwise.
  const effort = settings.reasoningEffort
  const custom =
    effort === "low" || effort === "medium" || effort === "high"
      ? { reasoningEffort: effort }
      : {}

  const prompt = `Match each channel to the best candidate id.\n\n${items
    .map(formatItem)
    .join("\n\n")}`
  const generate = (modelId: string) =>
    generateText({
      model: provider(modelId),
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0,
      providerOptions: { custom },
    })

  const generateText_ = async (modelId: string) => {
    try {
      return (await generate(modelId)).text
    } catch (error) {
      // A browser can retain a model that was removed from the provider. Keep
      // the AI Provider selection first, but fall back to the verified server
      // model rather than failing every batch with "Model not found".
      if (
        requestedModel &&
        envModel &&
        requestedModel !== envModel &&
        /model not found/i.test(error instanceof Error ? error.message : "")
      ) {
        console.warn(
          `[XMLTV] Requested model \"${requestedModel}\" was unavailable; using server model \"${envModel}\".`
        )
        return (await generate(envModel)).text
      }
      throw error
    }
  }

  // Strict parse: strip any code fences json_object mode still wraps around the
  // object, then validate the whole shape.
  const parseStrict = (text: string) => {
    const json = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
    try {
      const parsed = rerankSchema.safeParse(JSON.parse(json))
      return parsed.success ? parsed.data.matches : null
    } catch {
      return null
    }
  }

  // Salvage: pull every well-formed {"key":N,"xmltvId":"…"} object out of a
  // response the strict parse rejected. A rare batch is malformed the same way
  // on every attempt (temperature 0 is deterministic), so rather than drop the
  // whole batch we keep the picks that did serialize cleanly.
  const parseSalvage = (text: string): { key: number; xmltvId: string }[] => {
    const matches: { key: number; xmltvId: string }[] = []
    const re = /"key"\s*:\s*(\d+)\s*,\s*"xmltvId"\s*:\s*"([^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      matches.push({ key: Number(m[1]), xmltvId: m[2] })
    }
    return matches
  }

  // A share of batches come back unparseable, usually a transient provider
  // hiccup that a clean retry fixes, occasionally a deterministic malformation
  // that salvage recovers. Either way we never drop a whole batch of channels.
  const first = await generateText_(model)
  let matches = parseStrict(first)
  if (!matches) {
    const second = await generateText_(model)
    matches = parseStrict(second) ?? parseSalvage(second)
  }

  const allowedByKey = new Map(
    items.map((item) => [item.key, new Set(item.candidates.map((c) => c.id))])
  )

  for (const match of matches) {
    const xmltvId = match.xmltvId?.trim()
    if (!xmltvId) {
      continue
    }
    if (allowedByKey.get(match.key)?.has(xmltvId)) {
      result.set(match.key, xmltvId)
    }
  }

  return result
}
