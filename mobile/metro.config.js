const { getDefaultConfig } = require("expo/metro-config")
const { withNativeWind } = require("nativewind/metro")
const path = require("node:path")

const projectRoot = __dirname
const repoRoot = path.resolve(projectRoot, "..")
const sharedRoot = path.resolve(repoRoot, "packages/shared")

const config = getDefaultConfig(projectRoot)

// The app is deliberately not a bun workspace member: NativeWind v4 needs
// Tailwind v3 and the web app needs v4, which one hoisted node_modules cannot
// serve. So it keeps its own dependencies and reaches the shared package by
// path instead — aliased rather than installed, because bun's `file:` copies
// the directory and edits to packages/shared would never arrive.
config.watchFolders = [sharedRoot]

config.resolver.extraNodeModules = {
  "@portalhop/shared": sharedRoot,
}

// Shared source is outside projectRoot, so Metro must be told to resolve its
// imports (react, etc.) back into this app's node_modules rather than looking
// for a node_modules beside it.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")]
config.resolver.disableHierarchicalLookup = true

module.exports = withNativeWind(config, { input: "./global.css" })
