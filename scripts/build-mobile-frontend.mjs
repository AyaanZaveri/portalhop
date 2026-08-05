#!/usr/bin/env node
// Exports the frontend as static files for the Tauri (mobile) build.
//
// `output: export` refuses to build a project that contains route handlers or
// middleware, and this repo has both — they are the backend the mobile app
// calls over the network. They can't simply be deleted, so they are moved out
// of the source tree for the duration of the export and restored afterwards,
// including when the build fails or the process is interrupted.

import { execFileSync } from "node:child_process"
import { existsSync, renameSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

// [live path, parked path] — server-only trees hidden during the export.
const serverOnlyPaths = [
  ["src/app/api", ".mobile-build-parked/api"],
  ["src/middleware.ts", ".mobile-build-parked/middleware.ts"],
].map(([from, to]) => [join(root, from), join(root, to)])

let parked = []

function park() {
  for (const [live, stashed] of serverOnlyPaths) {
    if (!existsSync(live)) continue
    renameSync(live, stashed)
    parked.push([live, stashed])
  }
}

function restore() {
  for (const [live, stashed] of parked.reverse()) {
    if (existsSync(stashed)) renameSync(stashed, live)
  }
  parked = []
  const parkDir = join(root, ".mobile-build-parked")
  if (existsSync(parkDir)) rmSync(parkDir, { recursive: true, force: true })
}

// Restore on any exit path, so an interrupted build never leaves the repo
// missing its API routes.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    restore()
    process.exit(1)
  })
}
process.on("uncaughtException", (error) => {
  restore()
  throw error
})

// The packaged app has no backend of its own, so it always needs one to call.
// Override via the environment to point a build at a staging server or a LAN
// dev server instead.
const defaultApiBaseUrl = "https://portalhop.vercel.app"
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || defaultApiBaseUrl

console.log(`Exporting mobile frontend against ${apiBaseUrl}`)

try {
  // The parked directory lives inside the project, so create it via rename's
  // parent: mkdir first.
  execFileSync("mkdir", ["-p", join(root, ".mobile-build-parked")])
  park()

  execFileSync("npx", ["next", "build"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      PORTALHOP_MOBILE_BUILD: "1",
      NEXT_PUBLIC_PORTALHOP_MOBILE: "1",
      NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
    },
  })
} finally {
  restore()
}

console.log("Static frontend written to out/")
