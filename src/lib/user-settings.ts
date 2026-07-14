// Per-user settings that sync across devices. Shared between client and server;
// keep this module free of server-only imports.
export type UserSettingsData = {
  /** ids of the user's saved sources shown on the home page. */
  enabledSourceIds: number[]
  /** whether the built-in iptv-org free playlist is shown. */
  iptvOrgEnabled: boolean
  logoSource: "provider" | "epg"
  useProxy: boolean
}

export const DEFAULT_USER_SETTINGS: UserSettingsData = {
  enabledSourceIds: [],
  iptvOrgEnabled: true,
  logoSource: "provider",
  useProxy: false,
}

/** Coerces an unknown value (e.g. a JSON patch body) into a partial settings. */
export function sanitizeSettingsPatch(
  value: unknown
): Partial<UserSettingsData> {
  if (!value || typeof value !== "object") {
    return {}
  }

  const input = value as Record<string, unknown>
  const patch: Partial<UserSettingsData> = {}

  if (Array.isArray(input.enabledSourceIds)) {
    patch.enabledSourceIds = [
      ...new Set(
        input.enabledSourceIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id))
      ),
    ]
  }

  if (typeof input.iptvOrgEnabled === "boolean") {
    patch.iptvOrgEnabled = input.iptvOrgEnabled
  }

  if (input.logoSource === "provider" || input.logoSource === "epg") {
    patch.logoSource = input.logoSource
  }

  if (typeof input.useProxy === "boolean") {
    patch.useProxy = input.useProxy
  }

  return patch
}
