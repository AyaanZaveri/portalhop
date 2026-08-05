// Origins the packaged mobile app presents to the backend. Capacitor serves the
// bundled frontend from a local origin rather than a real host, so the
// webview's Origin header is one of these fixed values rather than a domain we
// control. Android uses the `androidScheme` from capacitor.config.ts
// (https://localhost); iOS uses capacitor://localhost. Both are listed so a
// future iOS build needs no server change.
// Deliberately no plain http://localhost: nothing ships with that origin, and
// listing it would let any local page reach this API with credentials.
export const mobileAppOrigins = ["https://localhost", "capacitor://localhost"]

/** True when `origin` is one of the packaged app's origins. */
export function isMobileAppOrigin(origin: string | null): origin is string {
  return origin !== null && mobileAppOrigins.includes(origin)
}
