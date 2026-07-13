const portalSettingsStorageKey = "portalhop-settings"

export function loadPortalSettings() {
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
  localStorage.setItem(portalSettingsStorageKey, JSON.stringify(settings))
}
