const { getDefaultConfig } = require("expo/metro-config")
const { withUniwindConfig } = require("uniwind/metro")
const path = require("node:path")

const projectRoot = __dirname
const sharedRoot = path.resolve(projectRoot, "..", "packages/shared")

const config = getDefaultConfig(projectRoot)

// The shared package is reached by path rather than installed: bun's `file:`
// copies the directory, so edits to packages/shared would stop propagating.
config.watchFolders = [sharedRoot]
config.resolver.extraNodeModules = { "@portalhop/shared": sharedRoot }
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")]
config.resolver.disableHierarchicalLookup = true

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
})
