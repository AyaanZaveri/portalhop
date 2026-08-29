// Per-user settings that sync across devices. Shared between client and server;
// keep this module free of server-only imports.
import {
  sanitizeEpgKindOrder,
  DEFAULT_EPG_KIND_ORDER,
  type EpgKind,
} from "./epg-preference"

export type UserSettingsData = {
  /** ids of the user's saved sources shown on the home page. */
  enabledSourceIds: number[]
  /** whether the built-in iptv-org free playlist is shown. */
  iptvOrgEnabled: boolean
  useProxy: boolean
  /** whether channel/EPG logos are routed through the wsrv.nl image proxy. */
  useImageProxy: boolean
  /**
   * Which kind of guide wins when a channel's sources offer more than one.
   *
   * Global and about kinds rather than about sources, because guide quality is
   * a property of a source *for a given channel*: a portal with excellent
   * listings for its own region has none for a channel it merely resells, so
   * any ranking of sources would be right for half a catalogue and quietly
   * wrong for the other half. Per-channel exceptions are stored separately and
   * sparsely; see channel_identity_prefs.
   */
  epgKindOrder: EpgKind[]
  /** Preferred playback portal ids, best first. Channels with a local order keep it. */
  sourcePriorityIds: number[]
  /** Preferred XMLTV providers, best first. `iptv-org` and `custom:<id>`. */
  epgProviderOrder: string[]
}

export const DEFAULT_USER_SETTINGS: UserSettingsData = {
  enabledSourceIds: [],
  iptvOrgEnabled: true,
  useProxy: true,
  useImageProxy: true,
  epgKindOrder: [...DEFAULT_EPG_KIND_ORDER],
  sourcePriorityIds: [],
  epgProviderOrder: ["iptv-org"],
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

  if (typeof input.useProxy === "boolean") {
    patch.useProxy = input.useProxy
  }

  if (typeof input.useImageProxy === "boolean") {
    patch.useImageProxy = input.useImageProxy
  }

  if (Array.isArray(input.epgKindOrder)) {
    patch.epgKindOrder = sanitizeEpgKindOrder(input.epgKindOrder)
  }

  if (Array.isArray(input.sourcePriorityIds)) {
    patch.sourcePriorityIds = [...new Set(input.sourcePriorityIds
      .map(Number)
      .filter(Number.isInteger)
      .filter((id) => id > 0))]
  }

  if (Array.isArray(input.epgProviderOrder)) {
    patch.epgProviderOrder = [...new Set(input.epgProviderOrder
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value === "iptv-org" || /^custom:\d+$/.test(value)))]
  }

  return patch
}
