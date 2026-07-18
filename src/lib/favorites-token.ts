import { randomBytes } from "node:crypto"

// 24 random bytes -> 32 URL-safe base64 characters, ~192 bits of entropy.
// Used as the sole authorization for the public favorites-playlist export
// URL (M3U players can't send a session cookie), so it must be unguessable
// and cheap to rotate if it ever leaks.
export function generateFavoritesToken(): string {
  return randomBytes(24).toString("base64url")
}
