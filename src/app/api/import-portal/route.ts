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
  serverUrl: z.string().optional().default(""),
  username: z.string().optional().default(""),
  password: z.string().optional().default(""),
  playlistUrl: z.string().optional().default(""),
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

const SYSTEM_PROMPT = `You are a strict field extraction engine for IPTV portal connection data. The pasted text may describe a Stalker/MAG portal (portal URL + MAC address, optionally serial/device IDs/signature), an Xtream Codes connection (server URL + username + password), or a plain M3U playlist link. An Xtream connection may appear as a playlist link such as http://host:port/get.php?username=...&password=...&type=m3u_plus, a player_api.php link with the same query params, or a direct stream link such as http://host:port/live/USERNAME/PASSWORD/12345.m3u8 or /movie/USERNAME/PASSWORD/12345.mp4 or /series/USERNAME/PASSWORD/12345.mp4 — in that path form, the two path segments between live|movie|series and the numeric stream id ARE the username and password, even though nothing labels them as such. Note that get.php/player_api.php links often contain "m3u" in a type= query parameter (e.g. type=m3u_plus) — that does NOT make them a plain M3U playlist; a link with username= and password= query parameters, or a live/movie/series path, is always Xtream, never playlistUrl, no matter what its query string says.

A single pasted URL is exactly one of Stalker, Xtream, or M3U — fill only the fields for the type the text actually shows, and leave every field for the other types blank.

Do not think out loud. Do not explain. Do not summarize. Do not include reasoning, notes, markdown, code fences, labels, or commentary. Return only the JSON object requested by the schema.

Copy values verbatim from the pasted text except for portalUrl normalization described below. Preserve casing for serial, DeviceID1, DeviceID2, signature, username, and password. Do not invent or rewrite missing values. Fill every schema field that is available in the text, and leave the fields for whichever connection type is NOT present blank.

You will receive:
1. A normalized candidate-lines section produced by preprocessing. Prefer this section when it clearly contains field labels and values.
2. The original pasted text. Use it to resolve ambiguity and copy exact values.

Field rules:
- portalUrl: only set this for a Stalker/MAG portal. Use the value labeled Portal, PortalUrl, Panel, or Panel URL when available. Prefer those over Real/RealUrl. Preserve /stalker_portal/c/ or /c/ when present. If only a host:port portal is available, output http://host:port/c/. Never put an Xtream get.php/player_api.php/live/movie/series link here, even if it is the only URL in the text.
- mac: use the MAC address exactly as shown. Only present for Stalker/MAG portals.
- serial: prefer SerialCut, Serial_cut, SN Cut, Serial Cut, or any serial cut label over the full Serial/SN whenever a cut value is present. Only use the full Serial/SN if no cut value exists.
- deviceId: use DeviceID1, Device ID 1, DEVICEID1, Dev_ID_1, Dev ID 1, or the first device id value. If there is only one generic Device ID with no 1/2 suffix, put it here.
- deviceId2: use DeviceID2, Device ID 2, DEVICEID2, Dev_ID_2, Dev ID 2, or the second device id value. If there is only one generic Device ID with no 1/2 suffix, copy the same value here too.
- signature: use the Signature value exactly as shown.
- timezone: use only an explicit timezone field.
- stbType: use only an explicit STB/model field.
- serverUrl: only set this for an Xtream connection. The scheme+host+port of the Xtream server, with no path, query string, or trailing slash (e.g. http://example.com:8080). If given a get.php, player_api.php, or live/movie/series stream link, strip everything after the host:port.
- username: the Xtream username, whether labeled explicitly (Username, User, Login), present as a username= query parameter, or the first path segment after live/movie/series in a direct stream link.
- password: the Xtream password, whether labeled explicitly (Password, Pass), present as a password= query parameter, or the second path segment after live/movie/series in a direct stream link.
- playlistUrl: only set this when the URL is none of the above — no MAC address, no username=/password= query parameters, and no live/movie/series credential path. Copy the URL exactly as given, with no normalization. This covers plain hosted M3U playlist links (e.g. ending in .m3u/.m3u8, or from a playlist-hosting service), which carry no separate credentials of their own.

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
    serverUrl: "",
    username: "",
    password: "",
    playlistUrl: "",
  }
}

function detectSourceType(
  portal: ImportedPortal
): "stalker" | "xtream" | "m3u" | null {
  if (portal.mac || portal.portalUrl) {
    return "stalker"
  }

  if (portal.serverUrl && portal.username && portal.password) {
    return "xtream"
  }

  if (portal.playlistUrl) {
    return "m3u"
  }

  return null
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
        /portal|real|mac|serial|sn|device|signature|timezone|stb|model|server|host|user|login|pass/i.test(
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

function extractXtreamFromUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    const queryUsername = url.searchParams.get("username")?.trim()
    const queryPassword = url.searchParams.get("password")?.trim()

    if (queryUsername && queryPassword) {
      return {
        serverUrl: `${url.protocol}//${url.host}`,
        username: queryUsername,
        password: queryPassword,
      }
    }

    // Direct stream links: /live|movie|series/{username}/{password}/{streamId}.{ext}
    const pathMatch = url.pathname.match(
      /^\/(?:live|movie|series)\/([^/]+)\/([^/]+)\/[^/]+$/i
    )

    if (pathMatch) {
      const username = decodeURIComponent(pathMatch[1])
      const password = decodeURIComponent(pathMatch[2])

      if (username && password) {
        return {
          serverUrl: `${url.protocol}//${url.host}`,
          username,
          password,
        }
      }
    }

    return null
  } catch {
    return null
  }
}

function parsePortalText(text: string): ImportedPortal {
  const parsed = emptyPortal()
  const normalized = normalizeText(text)
  const lines = normalized.split(/\r?\n/)

  for (const url of normalized.matchAll(/https?:\/\/[^\s)\]]+/gi)) {
    const xtream = extractXtreamFromUrl(url[0])

    if (xtream) {
      parsed.serverUrl ||= xtream.serverUrl
      parsed.username ||= xtream.username
      parsed.password ||= xtream.password
      break
    }
  }

  for (const line of lines) {
    const lower = line.toLowerCase()
    const value = lineValue(line) || cleanValue(line)

    if (
      /\bserver\b|\bhost\b/.test(lower) &&
      !/\bportal\b|\bpanel\b/.test(lower) &&
      !parsed.serverUrl
    ) {
      const url =
        line.match(/https?:\/\/[^\s)\]]+/i)?.[0] ??
        value.match(/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?/i)?.[0]

      if (url) {
        const withScheme = /^https?:\/\//i.test(url) ? url : `http://${url}`
        parsed.serverUrl = withScheme.replace(/\/+$/, "")
      }
    }

    if (/\busername\b|\buser\b|\blogin\b/.test(lower) && !parsed.username) {
      parsed.username =
        valueAfterLabel(line, /username|user|login/i) || value
    }

    if (/\bpassword\b|\bpass\b/.test(lower) && !parsed.password) {
      parsed.password = valueAfterLabel(line, /password|pass/i) || value
    }

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

  if (!parsed.mac) {
    parsed.mac = normalized.match(/[0-9a-f]{2}(?::[0-9a-f]{2}){5}/i)?.[0] ?? ""
  }

  const isXtreamLink = Boolean(
    parsed.serverUrl && parsed.username && parsed.password
  )

  if (!parsed.portalUrl && !isXtreamLink) {
    const url = normalized.match(/https?:\/\/[^\s)\]]+/i)?.[0]

    if (url) {
      if (parsed.mac) {
        // A MAC address means this is unambiguously a Stalker/MAG portal.
        parsed.portalUrl = normalizePortalUrl(url)
      } else {
        // No MAC and no Xtream credentials — the only connection type a bare
        // URL can represent on its own is a plain M3U playlist link.
        parsed.playlistUrl = url
      }
    }
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
    serverUrl:
      normalizedAi.serverUrl.replace(/\/+$/, "") || fallback.serverUrl,
    username: normalizedAi.username || fallback.username,
    password: normalizedAi.password || fallback.password,
    playlistUrl: normalizedAi.playlistUrl || fallback.playlistUrl,
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
      return NextResponse.json({
        portal: fallback,
        sourceType: detectSourceType(fallback),
        source: "fallback",
      })
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
        custom:
          settings?.reasoningEffort === "low" ||
          settings?.reasoningEffort === "medium" ||
          settings?.reasoningEffort === "high"
            ? { reasoningEffort: settings.reasoningEffort }
            : {},
      },
    })

    const merged = mergeImportedFields(fallback, output)

    return NextResponse.json({
      portal: merged,
      sourceType: detectSourceType(merged),
      source: "ai",
    })
  } catch (err) {
    if (hasAnyField(fallback)) {
      return NextResponse.json({
        portal: fallback,
        sourceType: detectSourceType(fallback),
        source: "fallback",
      })
    }

    const message =
      err instanceof Error ? err.message : "Could not import portal text."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
