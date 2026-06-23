import { NextResponse } from "next/server"

interface ModelsRequest {
  baseUrl?: string
  apiKey?: string
}

export async function POST(request: Request) {
  const { baseUrl, apiKey }: ModelsRequest = await request.json()

  const effectiveBaseUrl = baseUrl?.trim() || process.env.AI_BASE_URL || ""
  const effectiveApiKey = apiKey?.trim() || process.env.AI_API_KEY || ""

  if (!effectiveBaseUrl) {
    return NextResponse.json(
      { error: "Missing base URL - provide one or set AI_BASE_URL" },
      { status: 400 }
    )
  }

  if (!effectiveApiKey) {
    return NextResponse.json(
      { error: "Missing API key - provide one or set AI_API_KEY" },
      { status: 400 }
    )
  }

  try {
    const normalized = effectiveBaseUrl.replace(/\/$/, "")
    const res = await fetch(`${normalized}/models`, {
      headers: { Authorization: `Bearer ${effectiveApiKey}` },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: text || `HTTP ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch models"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
