"use client"

import { createAuthClient } from "better-auth/react"

import {
  apiBaseUrl,
  getBearerToken,
  isRemoteApi,
  setBearerToken,
} from "@/lib/api-fetch"

// On web this stays same-origin and cookie-based, exactly as before. On mobile
// the auth routes live on the deployed backend, where the cookie can't follow
// us across origins — so we capture the token the bearer plugin returns in the
// `set-auth-token` header and send it back as `Authorization` from then on.
export const authClient = createAuthClient({
  ...(isRemoteApi() ? { baseURL: apiBaseUrl } : {}),
  fetchOptions: isRemoteApi()
    ? {
        credentials: "include",
        auth: {
          type: "Bearer",
          token: () => getBearerToken() ?? "",
        },
        onSuccess: (ctx) => {
          const token = ctx.response.headers.get("set-auth-token")
          if (token) setBearerToken(token)
        },
      }
    : undefined,
})

/** Clears the stored mobile session token; safe to call on the web build. */
export function clearStoredSession() {
  setBearerToken(null)
}
