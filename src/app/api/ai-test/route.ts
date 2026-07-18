import { NextResponse } from "next/server"

interface AiTestRequest {
  baseUrl?: string
  apiKey?: string
  model?: string
}

/**
 * Verify that the selected OpenAI-compatible model is reachable AND supports
 * JSON object output. Channel enrichment relies on `response_format:
 * {type:"json_object"}`; a model that ignores or rejects it silently drops
 * matches, so the test surfaces that up front.
 */
export async function POST(request: Request) {
  let body: AiTestRequest
  try {
    body = (await request.json()) as AiTestRequest
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const baseUrl = body.baseUrl?.trim() || process.env.AI_BASE_URL || ""
  const apiKey = body.apiKey?.trim() || process.env.AI_API_KEY || ""
  const model = body.model?.trim() || process.env.AI_MODEL?.trim() || ""

  if (!baseUrl || !apiKey || !model) {
    return NextResponse.json(
      { error: "Base URL, API key, and model are required." },
      { status: 400 }
    )
  }

  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`

  const chat = (withJsonMode: boolean) => {
    const payload: Record<string, unknown> = {
      model,
      max_tokens: 64,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Reply with only a compact JSON object, no prose.",
        },
        {
          role: "user",
          content: 'Return exactly this JSON: {"status":"ok"}',
        },
      ],
    }
    if (withJsonMode) {
      payload.response_format = { type: "json_object" }
    }
    return fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })
  }

  const contentOf = async (response: Response): Promise<string> => {
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return data.choices?.[0]?.message?.content ?? ""
  }

  const parsesAsJson = (text: string): boolean => {
    const json = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
    try {
      const value = JSON.parse(json)
      return typeof value === "object" && value !== null
    } catch {
      return false
    }
  }

  try {
    const startedAt = performance.now()
    const jsonResponse = await chat(true)

    if (jsonResponse.ok) {
      const responseTimeMs = Math.round(performance.now() - startedAt)
      // Accepting the param is not enough; the model must actually return
      // parseable JSON for enrichment to rely on it.
      const jsonSupported = parsesAsJson(await contentOf(jsonResponse))
      return NextResponse.json({
        ok: true,
        model,
        responseTimeMs,
        jsonSupported,
      })
    }

    // The provider rejected `response_format`. Fall back to a plain request so
    // we can tell "model is broken/unreachable" from "model works but has no
    // JSON mode".
    const jsonModeError = (await jsonResponse.text()).slice(0, 300)
    const plainResponse = await chat(false)

    if (!plainResponse.ok) {
      const detail = await plainResponse.text()
      return NextResponse.json(
        { error: detail || `Provider returned HTTP ${plainResponse.status}` },
        { status: plainResponse.status }
      )
    }

    return NextResponse.json({
      ok: true,
      model,
      responseTimeMs: Math.round(performance.now() - startedAt),
      jsonSupported: false,
      jsonModeError,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not reach AI provider.",
      },
      { status: 500 }
    )
  }
}
