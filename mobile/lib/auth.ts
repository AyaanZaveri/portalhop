import { expoClient } from "@better-auth/expo/client"
import { usernameClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import * as SecureStore from "expo-secure-store"

import { apiBaseUrl } from "./config"

// The plugin keeps a cookie jar in SecureStore under `<storagePrefix>_cookie`
// and replays it as a Cookie header. That is why apiFetch borrows
// authClient.getCookie() rather than reading a bearer token: there isn't one.
// The Capacitor build needed bearer only because a webview cannot send a
// cross-site cookie; native fetch is under no such constraint.
export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
  plugins: [
    expoClient({
      scheme: "portalhop",
      storagePrefix: "portalhop",
      storage: SecureStore,
    }),
    usernameClient(),
  ],
})

export const { useSession, signIn, signUp, signOut } = authClient
