import { expoClient } from "@better-auth/expo/client"
import { createAuthClient } from "better-auth/react"
import * as SecureStore from "expo-secure-store"

import { apiBaseUrl } from "./api"

// The server already runs better-auth with the bearer() plugin, which is what
// the Capacitor build authenticates against by hand — capturing set-auth-token
// and replaying Authorization. The Expo plugin does that by design, backed by
// the keychain rather than localStorage, so the manual version goes away.
export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
  plugins: [
    expoClient({
      scheme: "portalhop",
      storagePrefix: "portalhop",
      storage: SecureStore,
    }),
  ],
})

export const { useSession, signIn, signUp, signOut } = authClient
