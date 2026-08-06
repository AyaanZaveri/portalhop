import { createMMKV } from "react-native-mmkv"

// Synchronous by design: the theme has to be known before the first paint, and
// an async read would flash the wrong scheme on every launch.
// v4 replaced the MMKV constructor with a factory.
const store = createMMKV({ id: "portalhop.preferences" })

const THEME_KEY = "theme"

export type ThemePreference = "light" | "dark" | "system"

export function getStoredTheme(): ThemePreference {
  const value = store.getString(THEME_KEY)
  return value === "light" || value === "dark" ? value : "system"
}

export function setStoredTheme(preference: ThemePreference) {
  store.set(THEME_KEY, preference)
}
