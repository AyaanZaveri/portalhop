const portalSettingsStorageKey = "portalhop-settings"

export function loadPortalSettings() {
  if (typeof window === "undefined") {
    return {}
  }

  try {
    const savedSettings = localStorage.getItem(portalSettingsStorageKey)

    if (savedSettings) {
      return JSON.parse(savedSettings) as {
        logoSource?: "provider" | "epg"
        useProxy?: boolean
      }
    }
  } catch (error) {
    console.error("Failed to parse settings from localStorage:", error)
  }

  return {}
}

export function savePortalSettings(settings: {
  logoSource: "provider" | "epg"
  useProxy: boolean
}) {
  if (typeof window === "undefined") {
    return
  }

  localStorage.setItem(portalSettingsStorageKey, JSON.stringify(settings))
}
