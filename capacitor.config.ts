/// <reference types="@capacitor/keyboard" />
/// <reference types="@capacitor/splash-screen" />

import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "app.portalhop.mobile",
  appName: "Portal Hop",
  // The static export produced by scripts/build-mobile-frontend.mjs.
  webDir: "out",
  android: {
    // Release APKs are signed separately; see docs/mobile-app.md.
    allowMixedContent: false,
  },
  server: {
    // Serves the bundled files from https://localhost, so the webview runs in a
    // secure context (required by the media APIs the player uses) and the
    // origin is stable enough for the backend to allow via CORS.
    androidScheme: "https",
  },
  plugins: {
    SystemBars: {
      // Android 15+ enforces edge-to-edge and Android 16 removed the opt-out,
      // so the app draws under the system bars whether it wants to or not.
      // "css" injects --safe-area-inset-* variables the stylesheet already
      // consumes, which is the only supported way to inset content now.
      insetsHandling: "css",
    },
    Keyboard: {
      // Works around the Android bug where a full-screen webview doesn't
      // resize for the keyboard, which would hide focused inputs.
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      // The app hides this itself once the shell has painted, so there's no
      // flash of an empty webview between splash and content.
      launchAutoHide: false,
      backgroundColor: "#0d0d0d",
      showSpinner: false,
    },
  },
}

export default config
