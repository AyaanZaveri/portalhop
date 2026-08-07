import { authClient } from "./auth"
import { apiBaseUrl } from "./config"

export { apiBaseUrl }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/**
 * `fetch` for the app's own API routes.
 *
 * Authentication is a Cookie header, not a bearer token. better-auth's Expo
 * plugin keeps a cookie jar in SecureStore and replays it on the auth client's
 * own calls; `getCookie()` is how anything else borrows the same session. The
 * Capacitor build used bearer only because a webview cannot send a cross-site
 * cookie — native fetch has no such restriction and no CORS to negotiate.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)

  const cookie = authClient.getCookie()
  if (cookie && !headers.has("Cookie")) headers.set("Cookie", cookie)

  return fetch(`${apiBaseUrl}${path}`, { ...init, headers })
}

/** apiFetch plus JSON parsing, throwing ApiError on a non-2xx. */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init)

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new ApiError(
      response.status,
      body?.error ?? `Request failed (${response.status})`,
    )
  }

  return (await response.json()) as T
}
