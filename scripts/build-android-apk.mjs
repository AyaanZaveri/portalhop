#!/usr/bin/env node
// Builds the Android APK end to end: static export -> cap sync -> Gradle, then
// drops a copy in dist-android/ under a name that says what it is.
//
// Pass --debug for a debug-signed APK that installs on a device without any
// signing setup. The default release build is unsigned; see docs/mobile-app.md.

import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const isDebug = process.argv.includes("--debug")
const variant = isDebug ? "debug" : "release"

// Gradle needs a JDK it supports; a newer one on JAVA_HOME fails the build.
const preferredJdk =
  "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home"
const env = { ...process.env }
if (!env.JAVA_HOME && existsSync(preferredJdk)) env.JAVA_HOME = preferredJdk
if (!env.ANDROID_HOME) {
  env.ANDROID_HOME = join(process.env.HOME ?? "", "Library/Android/sdk")
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", env, ...options })
}

console.log(`\n=== 1/3  Exporting static frontend ===`)
run("node", ["scripts/build-mobile-frontend.mjs"])

console.log(`\n=== 2/3  Syncing web assets into the Android project ===`)
run("npx", ["cap", "sync", "android"])

console.log(`\n=== 3/3  Assembling ${variant} APK ===`)
run("./gradlew", [isDebug ? "assembleDebug" : "assembleRelease"], {
  cwd: join(root, "android"),
})

const builtApk = join(
  root,
  "android/app/build/outputs/apk",
  variant,
  isDebug ? "app-debug.apk" : "app-release-unsigned.apk",
)

if (!existsSync(builtApk)) {
  console.error(`Expected an APK at ${builtApk}, but it isn't there.`)
  process.exit(1)
}

const version = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version
const outDir = join(root, "dist-android")
mkdirSync(outDir, { recursive: true })

const destination = join(outDir, `portal-hop-${version}-${variant}.apk`)
copyFileSync(builtApk, destination)

const megabytes = (
  readFileSync(destination).byteLength /
  1024 /
  1024
).toFixed(1)
console.log(`\nAPK ready: dist-android/${destination.split("/").pop()} (${megabytes} MB)`)
if (!isDebug) {
  console.log(
    "This is an unsigned release build. To install it on a device, either sign\n" +
      "it or rebuild with --debug for a debug-signed APK.",
  )
}
