import type { NextConfig } from "next";

// The mobile build ships the frontend as plain files inside the APK, so it is
// exported statically and talks to the deployed backend over the network. The
// web build is untouched by any of this.
const isMobileBuild = process.env.PORTALHOP_MOBILE_BUILD === "1";

const mobileConfig: NextConfig = {
  output: "export",
  // Emits `out/tv/index.html` rather than `out/tv.html`, so the webview
  // resolves a directory path to its index without a server to rewrite it.
  trailingSlash: true,
  // The Image Optimization API needs a server; there is none inside the APK.
  images: { unoptimized: true },
};

const webConfig: NextConfig = {
  // `headers()` is a server feature and is rejected under `output: export`.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: ["10.0.0.109"],
  ...(isMobileBuild ? mobileConfig : webConfig),
};

export default nextConfig;
