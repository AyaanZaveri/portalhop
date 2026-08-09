const { withGradleProperties } = require("expo/config-plugins")

/**
 * Turns on react-native-screens' gamma stack for Android.
 *
 * ExperimentalStack is built on that stack, and predictive back is the reason
 * to want it — so without this, the one platform the feature exists on is the
 * one platform it is compiled out of.
 *
 * expo-router's own plugin only does the iOS half: it writes RNS_GAMMA_ENABLED
 * into the Podfile and stops there. Android gates the same thing on a Gradle
 * property instead, `rnsGammaEnabled`, which react-native-screens reads in its
 * build.gradle:
 *
 *   def isGammaEnabled() {
 *     return project.hasProperty("rnsGammaEnabled") && project.rnsGammaEnabled == "true"
 *   }
 *
 * Nothing sets it, so it compiles out silently — the JavaScript imports fine
 * and the navigator simply has no gamma underneath it.
 *
 * A plugin rather than an edit to android/gradle.properties, because that
 * directory is generated: prebuild rewrites it on every build, here and in CI,
 * and a hand-edit would last exactly until the next one.
 */
module.exports = function withReactNativeScreensGamma(config) {
  return withGradleProperties(config, (config) => {
    const key = "rnsGammaEnabled"
    const existing = config.modResults.find(
      (item) => item.type === "property" && item.key === key,
    )

    if (existing) {
      existing.value = "true"
    } else {
      config.modResults.push({ type: "property", key, value: "true" })
    }

    return config
  })
}
