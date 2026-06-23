import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText, Output } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"

const importedPortalSchema = z.object({
  portalUrl: z.string().optional().default(""),
  mac: z.string().optional().default(""),
  serial: z.string().optional().default(""),
  deviceId: z.string().optional().default(""),
  deviceId2: z.string().optional().default(""),
  signature: z.string().optional().default(""),
  timezone: z.string().optional().default(""),
  stbType: z.string().optional().default(""),
})

type ImportedPortal = z.infer<typeof importedPortalSchema>

interface ImportPortalRequest {
  text?: string
  settings?: {
    baseUrl?: string
    apiKey?: string
    model?: string
    reasoningEffort?: "none" | "low" | "medium" | "high" | "max"
  }
}

const SYSTEM_PROMPT = `You are a strict field extraction engine for Stalker portal connection data.

Do not think out loud. Do not explain. Do not summarize. Do not include reasoning, notes, markdown, code fences, labels, or commentary. Return only the structured object requested by the schema.

Copy values verbatim from the pasted text except for portalUrl normalization described below. Preserve casing for serial, DeviceID1, DeviceID2, and signature. Do not invent or rewrite missing values. Fill every schema field that is available in the text.

You will receive:
1. A normalized candidate-lines section produced by preprocessing. Prefer this section when it clearly contains field labels and values.
2. The original pasted text. Use it to resolve ambiguity and copy exact values.

Field rules:
- portalUrl: use the value labeled Portal, PortalUrl, Panel, or Panel URL when available. Prefer those over Real/RealUrl. Preserve /stalker_portal/c/ or /c/ when present. If only a host:port portal is available, output http://host:port/c/.
- mac: use the MAC address exactly as shown.
- serial: prefer SerialCut, Serial_cut, SN Cut, Serial Cut, or any serial cut label over the full Serial/SN whenever a cut value is present. Only use the full Serial/SN if no cut value exists.
- deviceId: use DeviceID1, Device ID 1, DEVICEID1, Dev_ID_1, Dev ID 1, or the first device id value. If there is only one generic Device ID with no 1/2 suffix, put it here.
- deviceId2: use DeviceID2, Device ID 2, DEVICEID2, Dev_ID_2, Dev ID 2, or the second device id value. If there is only one generic Device ID with no 1/2 suffix, copy the same value here too.
- signature: use the Signature value exactly as shown.
- timezone: use only an explicit timezone field.
- stbType: use only an explicit STB/model field.

Ignore scan metadata, dates, expiration, VPN location, m3u lines, hits/by lines, markdown links, emoji, decorative box drawing, and labels after extracting their values.`

function emptyPortal(): ImportedPortal {
  return {
    portalUrl: "",
    mac: "",
    serial: "",
    deviceId: "",
    deviceId2: "",
    signature: "",
    timezone: "",
    stbType: "",
  }
}

function normalizeText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2")
}

function preprocessForAi(text: string) {
  return normalizeText(text)
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[├╰╭╮╯│─━└┌┐┘┬┴┤►▶➤➜➡]+/g, " ")
        .replace(/[^\p{L}\p{N}:./?&=%@+_-]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((line) => {
      if (!line) {
        return false
      }

      return (
        /portal|real|mac|serial|sn|device|signature|timezone|stb|model/i.test(
          line
        ) ||
        /https?:\/\/\S+/i.test(line) ||
        /[0-9a-f]{2}(?::[0-9a-f]{2}){5}/i.test(line)
      )
    })
    .join("\n")
}

function cleanValue(value: string) {
  return value
    .replace(/^[\s:：\-–—|>➤]+/, "")
    .replace(/^[^a-z0-9./]+/i, "")
    .replace(/[\s"'`]+$/g, "")
    .trim()
}

function normalizePortalUrl(value: string) {
  let url = cleanValue(value)

  if (!url) {
    return ""
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`
  }

  if (!/\/(?:stalker_portal\/)?c\/?$/i.test(url)) {
    url = `${url.replace(/\/+$/, "")}/c/`
  }

  return url
}

function lineValue(line: string) {
  const parts = line.split(/➤|=>|:|：/)
  return cleanValue(parts.slice(1).join(":"))
}

function valueAfterLabel(line: string, labelPattern: RegExp) {
  const match = labelPattern.exec(line)

  if (!match) {
    return ""
  }

  return cleanValue(line.slice(match.index + match[0].length))
}

function firstToken(value: string, minLength: number) {
  return value.match(new RegExp(`[a-z0-9]{${minLength},}`, "i"))?.[0] ?? ""
}

function parsePortalText(text: string): ImportedPortal {
  const parsed = emptyPortal()
  const normalized = normalizeText(text)
  const lines = normalized.split(/\r?\n/)

  for (const line of lines) {
    const lower = line.toLowerCase()
    const value = lineValue(line) || cleanValue(line)

    if (/\bportal\b|\bpanel\b/.test(lower) && !parsed.portalUrl) {
      const url =
        line.match(/https?:\/\/[^\s)\]]+/i)?.[0] ??
        value.match(/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?/i)?.[0]

      if (url) {
        parsed.portalUrl = normalizePortalUrl(url)
      }
    }

    if (/\bmac\b/.test(lower) && !parsed.mac) {
      parsed.mac = line.match(/[0-9a-f]{2}(?::[0-9a-f]{2}){5}/i)?.[0] ?? ""
    }

    if (/\bserial[\s_-]*cut\b|\bserialcut\b|\bsn[\s_-]*cut\b/.test(lower)) {
      const serialCutValue =
        valueAfterLabel(line, /serial[\s_-]*cut|serialcut|sn[\s_-]*cut/i) ||
        value
      parsed.serial = firstToken(serialCutValue, 8) || parsed.serial
    } else if (/\bserial\b|\bsn\b/.test(lower)) {
      const serialValue = valueAfterLabel(line, /serial|sn/i) || value
      parsed.serial ||= firstToken(serialValue, 8)
    }

    if (/\bdevice[\s_-]*id[\s_-]*1\b|\bdeviceid1\b|\bdev[\s_-]*id[\s_-]*1\b/.test(lower)) {
      const deviceIdValue =
        valueAfterLabel(
          line,
          /device[\s_-]*id[\s_-]*1|deviceid1|dev[\s_-]*id[\s_-]*1/i
        ) || value
      parsed.deviceId ||= firstToken(deviceIdValue, 16)
    }

    if (/\bdevice[\s_-]*id[\s_-]*2\b|\bdeviceid2\b|\bdev[\s_-]*id[\s_-]*2\b/.test(lower)) {
      const deviceId2Value =
        valueAfterLabel(
          line,
          /device[\s_-]*id[\s_-]*2|deviceid2|dev[\s_-]*id[\s_-]*2/i
        ) || value
      parsed.deviceId2 ||= firstToken(deviceId2Value, 16)
    } else if (/\bdevice[\s_-]*id\b|\bdeviceid\b|\bdev[\s_-]*id\b/.test(lower)) {
      const deviceIdValue =
        valueAfterLabel(line, /device[\s_-]*id|deviceid|dev[\s_-]*id/i) ||
        value
      const genericDeviceId = firstToken(deviceIdValue, 16)

      if (genericDeviceId) {
        parsed.deviceId ||= genericDeviceId
        parsed.deviceId2 ||= genericDeviceId
      }
    }

    if (/\bsignature\b/.test(lower)) {
      const signatureValue = valueAfterLabel(line, /signature/i) || value
      parsed.signature ||= firstToken(signatureValue, 16)
    }

    if (/\bstb\b/.test(lower)) {
      parsed.stbType ||= valueAfterLabel(line, /stb\s*type|stb|model/i) || value
    }

    if (/\btimezone\b|\btime\s*zone\b/.test(lower)) {
      parsed.timezone ||= value
    }
  }

  if (!parsed.portalUrl) {
    const url = normalized.match(/https?:\/\/[^\s)\]]+/i)?.[0]
    if (url) {
      parsed.portalUrl = normalizePortalUrl(url)
    }
  }

  if (!parsed.mac) {
    parsed.mac = normalized.match(/[0-9a-f]{2}(?::[0-9a-f]{2}){5}/i)?.[0] ?? ""
  }

  return parsed
}

function mergeImportedFields(
  fallback: ImportedPortal,
  aiResult?: Partial<ImportedPortal>
): ImportedPortal {
  const normalizedAi = importedPortalSchema.parse(aiResult ?? {})
  const serial = fallback.serial || normalizedAi.serial
  const deviceId = normalizedAi.deviceId || fallback.deviceId
  const deviceId2 = normalizedAi.deviceId2 || fallback.deviceId2 || deviceId

  return {
    portalUrl: normalizePortalUrl(normalizedAi.portalUrl) || fallback.portalUrl,
    mac: normalizedAi.mac || fallback.mac,
    serial,
    deviceId,
    deviceId2,
    signature: normalizedAi.signature || fallback.signature,
    timezone: normalizedAi.timezone || fallback.timezone,
    stbType: normalizedAi.stbType || fallback.stbType,
  }
}

function hasAnyField(portal: ImportedPortal) {
  return Object.values(portal).some((value) => value.trim().length > 0)
}

export async function POST(request: Request) {
  const { text = "", settings }: ImportPortalRequest = await request.json()
  const fallback = parsePortalText(text)
  const preprocessedText = preprocessForAi(text)

  if (!text.trim()) {
    return NextResponse.json(
      { error: "Paste portal text to import." },
      { status: 400 }
    )
  }

  const apiKey = settings?.apiKey || process.env.AI_API_KEY || ""
  const baseUrl = settings?.baseUrl || process.env.AI_BASE_URL || ""
  const model = settings?.model?.trim() ?? ""

  if (!baseUrl || !model) {
    if (hasAnyField(fallback)) {
      return NextResponse.json({ portal: fallback, source: "fallback" })
    }

    return NextResponse.json(
      { error: "Configure AI settings before importing this text." },
      { status: 400 }
    )
  }

  try {
    const provider = createOpenAICompatible({
      baseURL: baseUrl,
      apiKey,
      name: "custom",
    })

    const { output } = await generateText({
      model: provider(model),
      system: SYSTEM_PROMPT,
      prompt: `Extract portal connection fields from the normalized candidate lines and original text below.

Normalized candidate lines:
${preprocessedText || "(none)"}

Original pasted text:
${text}`,
      output: Output.object({ schema: importedPortalSchema }),
      temperature: 0,
      providerOptions: {
        custom: { reasoningEffort: settings?.reasoningEffort ?? "none" },
      },
    })

    return NextResponse.json({
      portal: mergeImportedFields(fallback, output),
      source: "ai",
    })
  } catch (err) {
    if (hasAnyField(fallback)) {
      return NextResponse.json({ portal: fallback, source: "fallback" })
    }

    const message =
      err instanceof Error ? err.message : "Could not import portal text."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
