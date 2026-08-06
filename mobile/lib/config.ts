import Constants from "expo-constants"

// Its own module so api.ts and auth.ts can both read it without importing each
// other — api.ts needs the auth client's cookie, and auth.ts needs this URL.
export const apiBaseUrl = String(
  Constants.expoConfig?.extra?.apiBaseUrl ?? "https://portalhop.vercel.app",
).replace(/\/$/, "")
