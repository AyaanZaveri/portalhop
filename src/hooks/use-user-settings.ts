"use client"

import * as React from "react"

import { authClient } from "@/lib/auth-client"
import {
  DEFAULT_USER_SETTINGS,
  type UserSettingsData,
} from "@portalhop/shared/user-settings"
import { apiFetch } from "@/lib/api-fetch"

type UseUserSettings = {
  settings: UserSettingsData
  /** True once the initial load (server or defaults) has resolved. */
  settingsLoaded: boolean
  /** The signed-in user id, or null. */
  userId: string | null
  /** Optimistically applies a patch and persists it (signed-in only). */
  updateSettings: (patch: Partial<UserSettingsData>) => void
}

export function useUserSettings(): UseUserSettings {
  const { data, isPending: sessionPending } = authClient.useSession()
  const userId = data?.user?.id ?? null

  const [settings, setSettings] =
    React.useState<UserSettingsData>(DEFAULT_USER_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    // While the session is resolving, userId is null but we are not necessarily
    // signed out. Committing to the defaults here would briefly render the
    // signed-out view (iptv-org only) before the real sources arrive, so stay
    // unloaded and let callers keep showing their loading state.
    if (sessionPending) {
      return
    }

    if (!userId) {
      // Signed out: defaults (iptv-org on, no user sources).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettings(DEFAULT_USER_SETTINGS)
      setSettingsLoaded(true)
      return
    }

    setSettingsLoaded(false)
    apiFetch("/api/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return
        if (body?.settings) {
          setSettings(body.settings as UserSettingsData)
        }
        setSettingsLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setSettingsLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [userId, sessionPending])

  const updateSettings = React.useCallback(
    (patch: Partial<UserSettingsData>) => {
      setSettings((prev) => ({ ...prev, ...patch }))

      if (!userId) return

      apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (body?.settings) {
            setSettings(body.settings as UserSettingsData)
          }
        })
        .catch(() => {})
    },
    [userId]
  )

  return { settings, settingsLoaded, userId, updateSettings }
}
