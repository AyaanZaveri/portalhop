import AsyncStorage from "@react-native-async-storage/async-storage"

import {
  parseBrowseFilter,
  type BrowseFilter,
} from "@portalhop/shared/browse-filter"

// AsyncStorage rather than MMKV: MMKV is a native module, so it cannot run in
// Expo Go, and nothing here needs its speed — this is one small key read once
// at launch. Async means the scheme resolves a frame late, which is why the
// splash is held until it has (see app/_layout.tsx).
const THEME_KEY = "portalhop.theme"

export type ThemePreference = "light" | "dark" | "system"

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const value = await AsyncStorage.getItem(THEME_KEY)
    if (value === "light" || value === "dark" || value === "system")
      return value
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

const PORTALS_KEY = "portalhop.selectedPortals"

/**
 * Which sources the list draws from, across launches.
 *
 * An empty set means "all portals" — the same convention the sheet uses — so
 * the absence of a saved value and an explicit "all" are indistinguishable on
 * purpose, and both land on the default.
 */
export async function loadSelectedPortalIds(): Promise<Set<number>> {
  try {
    const value = await AsyncStorage.getItem(PORTALS_KEY)
    if (!value) return new Set()
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is number => typeof id === "number"))
  } catch {
    return new Set()
  }
}

/**
 * The chip the user was last on, per account.
 *
 * Keyed by user id the way the web keys its localStorage entry, so signing in
 * as someone else does not drop you into their last category. `parseBrowseFilter`
 * is the web's own validator — a stored filter naming a category that no longer
 * exists has to be rejected rather than trusted.
 */
function browseFilterKey(userId: string | null) {
  return `portalhop.browseFilter:${userId ?? "guest"}`
}

export async function loadBrowseFilter(
  userId: string | null,
): Promise<BrowseFilter | null> {
  try {
    const value = await AsyncStorage.getItem(browseFilterKey(userId))
    return parseBrowseFilter(value ?? undefined)
  } catch {
    return null
  }
}

export async function saveBrowseFilter(
  userId: string | null,
  filter: BrowseFilter,
) {
  try {
    await AsyncStorage.setItem(browseFilterKey(userId), JSON.stringify(filter))
  } catch {
    // The chip just won't survive a restart.
  }
}

export async function saveSelectedPortalIds(ids: Set<number>) {
  try {
    await AsyncStorage.setItem(PORTALS_KEY, JSON.stringify([...ids]))
  } catch {
    // Same as above: the selection just won't survive a restart.
  }
}
