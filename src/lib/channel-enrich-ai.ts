import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText, Output } from "ai"
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
}

const rerankSchema = z.object({
  matches: z.array(
    z.object({
      key: z.number(),
      xmltvId: z.string(),
    })
  ),
})

const SYSTEM_PROMPT = `You match IPTV channel names to their canonical EPG channel id.

You are given a list of channels. Each has a numeric "key", the channel "name" as it appears in the user's playlist, and a short list of candidate EPG channels (each with an "id" and "name"). For every channel, pick the id of the candidate that refers to the SAME television channel.

Rules:
- Choose only from the provided candidate ids for that channel. Never invent an id.
- Match the actual broadcaster/feed, accounting for regional variants (e.g. "CNN" is not "CNN International" or "CNN en Español"), language, and country. Prefer the candidate whose region/language best fits the channel name.
- Ignore quality tags (HD, FHD, 4K, SD, VIP, backup) and leading country prefixes when comparing.
- If none of the candidates is clearly the same channel, return an empty string for that key.
- Do not explain. Respond with only the JSON object matching the schema, of the form {"matches":[{"key":<number>,"xmltvId":"<id>"}]}.`

function formatItem(item: RerankItem): string {
  const candidates = item.candidates
    .map((candidate) => `    - ${candidate.id} :: ${candidate.name}`)
    .join("\n")
  return `key ${item.key}: "${item.name}"\n${candidates}`
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
  const model = settings.model?.trim() ?? ""

  if (!baseUrl || !model) {
    throw new Error("AI provider is not configured.")
  }

  const provider = createOpenAICompatible({
    baseURL: baseUrl,
    apiKey,
    name: "custom",
  })

  // Only forward reasoning_effort when it's a value providers accept. Some
  // (e.g. NVIDIA NIM) reject "none"/"max", so omit it otherwise.
  const effort = settings.reasoningEffort
  const custom =
    effort === "low" || effort === "medium" || effort === "high"
      ? { reasoningEffort: effort }
      : {}

  const { output } = await generateText({
    model: provider(model),
    system: SYSTEM_PROMPT,
    prompt: `Match each channel to the best candidate id.\n\n${items
      .map(formatItem)
      .join("\n\n")}`,
    output: Output.object({ schema: rerankSchema }),
    temperature: 0,
    providerOptions: { custom },
  })

  const allowedByKey = new Map(
    items.map((item) => [item.key, new Set(item.candidates.map((c) => c.id))])
  )

  for (const match of output?.matches ?? []) {
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
