import AsyncStorage from "@react-native-async-storage/async-storage"

// AsyncStorage rather than MMKV: MMKV is a native module, so it cannot run in
// Expo Go, and nothing here needs its speed — this is one small key read once
// at launch. Async means the scheme resolves a frame late, which is why the
// splash is held until it has (see app/_layout.tsx).
const THEME_KEY = "portalhop.theme"

export type ThemePreference = "light" | "dark" | "system"

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const value = await AsyncStorage.getItem(THEME_KEY)
    if (value === "light" || value === "dark" || value === "system") return value
  } catch {
    // A storage failure should fall back to the system scheme, not crash boot.
  }
  return "system"
}

export async function saveThemePreference(preference: ThemePreference) {
  try {
    await AsyncStorage.setItem(THEME_KEY, preference)
  } catch {
    // The choice simply won't survive a restart; not worth interrupting for.
  }
}
