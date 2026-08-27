import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { bearer, username } from "better-auth/plugins"

import { getDb } from "@/db/client"
import * as schema from "@/db/schema"
import { mobileAppOrigins } from "@/lib/mobile-origins"

export const auth = betterAuth({
  // The packaged mobile app is a different origin from this backend, so it has
  // to be trusted explicitly before better-auth will answer its requests.
  trustedOrigins: mobileAppOrigins,
  // Lets the mobile build authenticate with `Authorization: Bearer <token>`
  // instead of a cookie, which can't cross origins. Browsers keep using the
  // cookie — the plugin only engages when the header is present.
  plugins: [bearer(), username()],
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "development-only-portalhop-better-auth-secret-change-me",
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
})
