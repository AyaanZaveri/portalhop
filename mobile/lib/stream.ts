import Constants from "expo-constants"

import { apiFetch } from "./api"

/**
 * The stream proxy, the same one the web points at.
 *
 * This was left unset on the reasoning that native does not need it: a browser
 * cannot play MPEG-TS or load http:// from an https:// page, and ExoPlayer has
 * neither problem. What that missed is that the proxy is not only a remuxer.
 * It fetches the stream server-side and hands back a playlist whose segments it
 * serves itself, so whatever the portal wants — its own headers, a redirect
 * chain, a host that only answers to the request the portal expects — is dealt
 * with where it can be dealt with. The app gets one https URL that behaves.
 *
 * Whether it is used is the account's setting, not this file's decision. See
 * resolveChannelLink.
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
  /**
   * The account's own preference, as the web reads it.
   *
   * The app used to ignore it and always play direct, so a portal that needs
   * the proxy played on the web and not here — the setting existed, was synced,
   * and did nothing on this platform.
   */
  useProxy: boolean,
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

  return useProxy ? proxyStreamUrl(data.link) : data.link
}
