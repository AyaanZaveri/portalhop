// Channel/EPG logos come straight from whatever host the portal or EPG feed
// happens to point at, often slow, unreliable, or plain HTTP. Routing them
// through wsrv.nl (weserv) gets them resized, re-encoded, and cached at the
// edge instead.
const WSRV_BASE_URL = "https://wsrv.nl/"

export function proxyImageUrl(url: string, enabled: boolean = true) {
  const trimmed = url.trim()

  if (!trimmed || !enabled) {
    return trimmed
  }

  // Imgur rejects/restricts many proxy-originated image requests. Keep these
  // URLs direct instead of routing them through wsrv.nl.
  try {
    const hostname = new URL(trimmed).hostname.toLowerCase()
    if (hostname === "imgur.com" || hostname.endsWith(".imgur.com")) {
      return trimmed
    }
  } catch {
    // Preserve the existing proxy behavior for non-standard logo strings.
  }

  const proxied = new URL(WSRV_BASE_URL)
  proxied.searchParams.set("url", trimmed)

  return proxied.href
}
