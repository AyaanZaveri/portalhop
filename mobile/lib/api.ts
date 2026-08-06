import Constants from "expo-constants"
import * as SecureStore from "expo-secure-store"

// The app has no backend of its own — it calls the deployed Next.js instance,
// exactly as the Capacitor build does. Configured per EAS profile via app.json's
// `extra`, so a dev build can point at a LAN server without a code change.
export const apiBaseUrl = String(
  Constants.expoConfig?.extra?.apiBaseUrl ?? "https://portalhop.vercel.app",
).replace(/\/$/, "")

// better-auth's Expo plugin owns this key; we read it to authenticate the app's
// own /api calls, which don't go through the auth client.
const SESSION_KEY = "portalhop.session_token"

export async function getSessionToken() {
  try {
    return await SecureStore.getItemAsync(SESSION_KEY)
  } catch {
    return null
  }
}

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
 * Native fetch sends no Origin header and isn't subject to CORS, so unlike the
 * web build there is nothing to negotiate — the bearer token is the whole story.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = await getSessionToken()
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  return fetch(`${apiBaseUrl}${path}`, { ...init, headers })
}

/** apiFetch plus JSON parsing and a thrown error for non-2xx. */
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
