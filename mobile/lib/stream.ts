import Constants from "expo-constants"

import { apiFetch } from "./api"

/**
 * Optional stream proxy, matching the web's NEXT_PUBLIC_PROXY_URL.
 *
 * Left unset by default, because native does not need it the way a browser
 * does. A Stalker portal usually hands back MPEG-TS over HTTP, which no browser
 * will play — hence the web remuxing it to HLS — while ExoPlayer reads it
 * directly. Going direct skips a hop and the latency that comes with it. Set
 * `extra.proxyBaseUrl` in app.json if a portal turns out to serve something
 * ExoPlayer will not take.
 */
const proxyBaseUrl = String(Constants.expoConfig?.extra?.proxyBaseUrl ?? "")
  .trim()
  .replace(/\/$/, "")

export function proxyStreamUrl(streamUrl: string) {
  if (!proxyBaseUrl) return streamUrl
  const url = new URL(`${proxyBaseUrl}/proxy/hls/manifest.m3u8`)
  url.searchParams.set("d", streamUrl)
  return url.href
}

export function isProxyConfigured() {
  return Boolean(proxyBaseUrl)
}

/**
 * The current playable URL for a channel.
 *
 * Resolved server-side from the source id and the saved channel id, which is
 * the same path the web takes for a saved channel: the portal credentials and
 * its stream command stay on the server, and the app only ever receives the
 * finished link. Stalker links are also short-lived and single-use, so this is
 * called at play time rather than stored with the catalogue.
 */
export async function resolveChannelLink(
  sourceId: number,
  savedChannelId: number,
  signal?: AbortSignal,
): Promise<string> {
  const response = await apiFetch("/api/channel-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ sourceId, savedChannelId }),
  })

  const data = (await response.json().catch(() => ({}))) as {
    link?: string
    error?: string
  }

  if (!response.ok || !data.link) {
    throw new Error(data.error || "Could not pull the latest stream.")
  }

  return proxyStreamUrl(data.link)
}
