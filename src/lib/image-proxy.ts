// Channel/EPG logos come straight from whatever host the portal or EPG feed
// happens to point at — often slow, unreliable, or plain HTTP. Routing them
// through wsrv.nl (weserv) gets them resized, re-encoded, and cached at the
// edge instead.
const WSRV_BASE_URL = "https://wsrv.nl/"

export function proxyImageUrl(url: string) {
  const trimmed = url.trim()

  if (!trimmed) {
    return trimmed
  }

  const proxied = new URL(WSRV_BASE_URL)
  proxied.searchParams.set("url", trimmed)

  return proxied.href
}
