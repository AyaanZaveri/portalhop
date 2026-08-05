// The mobile build (Tauri) ships only the frontend, so every `/api` call has to
// travel to the deployed backend instead of the app's own origin. On the web
// build NEXT_PUBLIC_API_BASE_URL is unset, `apiBaseUrl` is empty, and requests
// stay same-origin — byte-for-byte the behaviour this app has always had.
export const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? ""
).replace(/\/$/, "")

// Cross-origin requests can't rely on the session cookie: the webview's origin
// (http://tauri.localhost) is a different site from the backend, so the cookie
// is never attached. better-auth's bearer plugin hands us the session token in
// a `set-auth-token` response header instead, which we replay as an
// Authorization header on every subsequent call.
export const bearerTokenStorageKey = "portalhop-bearer-token"

export function isRemoteApi() {
  return apiBaseUrl.length > 0
}

export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(bearerTokenStorageKey)
  } catch {
    return null
  }
}

export function setBearerToken(token: string | null) {
  if (typeof window === "undefined") return
  try {
    if (token) window.localStorage.setItem(bearerTokenStorageKey, token)
    else window.localStorage.removeItem(bearerTokenStorageKey)
  } catch {
    // Private-mode webviews can refuse localStorage; the session simply won't
    // survive a restart, which beats crashing the request.
  }
}

/** Resolves an app-relative `/api/...` path against the configured backend. */
export function apiUrl(path: string) {
  return path.startsWith("/api") ? `${apiBaseUrl}${path}` : path
}

/**
 * Fully-qualified URL for an API path, for links and copied-to-clipboard URLs
 * that have to work outside the app. On mobile `window.location.origin` is the
 * webview's internal origin, which is meaningless anywhere else, so the
 * configured backend wins there.
 */
export function absoluteApiUrl(path: string) {
  const origin =
    apiBaseUrl ||
    (typeof window === "undefined" ? "" : window.location.origin)
  return new URL(path, origin).href
}

/**
 * Drop-in replacement for `fetch` on `/api` routes. Same-origin on web; on
 * mobile it retargets the deployed backend and carries the bearer token.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const remote = isRemoteApi()
  const headers = new Headers(init.headers)

  if (remote) {
    const token = getBearerToken()
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`)
    }
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    // Same-origin keeps sending the cookie on web. Cross-origin we still ask
    // for credentials so a `Set-Cookie` works when the backend and app happen
    // to share a site, but the bearer header is what actually carries us.
    credentials: remote ? "include" : init.credentials,
  })

  // Any response may rotate the session token; keep the stored copy current.
  if (remote) {
    const refreshed = response.headers.get("set-auth-token")
    if (refreshed) setBearerToken(refreshed)
  }

  return response
}
