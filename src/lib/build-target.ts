// True when this bundle was produced by scripts/build-mobile-frontend.mjs for
// packaging inside the Tauri app, rather than served from the web deployment.
// Inlined at build time, so branches guarded by it are dropped from the bundle
// that doesn't need them.
export const isMobileApp = process.env.NEXT_PUBLIC_PORTALHOP_MOBILE === "1"
