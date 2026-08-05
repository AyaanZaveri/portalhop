"use client"

import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-fetch"

export interface AiSettings {
  model: string
  reasoningEffort?: "none" | "low" | "medium" | "high" | "max"
  overrideEnv?: boolean
  customBaseUrl?: string
  customApiKey?: string
}

const STORAGE_KEY = "portalhop-ai-settings"

function loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed.model === "string") {
        const validated: AiSettings = {
          model: parsed.model,
        }
        if (
          parsed.reasoningEffort === "none" ||
          parsed.reasoningEffort === "low" ||
          parsed.reasoningEffort === "medium" ||
          parsed.reasoningEffort === "high" ||
          parsed.reasoningEffort === "max"
        ) {
          validated.reasoningEffort = parsed.reasoningEffort
        }
        if (typeof parsed.overrideEnv === "boolean") {
          validated.overrideEnv = parsed.overrideEnv
        }
        if (typeof parsed.customBaseUrl === "string") {
          validated.customBaseUrl = parsed.customBaseUrl
        }
        if (typeof parsed.customApiKey === "string") {
          validated.customApiKey = parsed.customApiKey
        }
        return validated
      }
    }
  } catch {
    // Ignore invalid local storage.
  }
  return { model: "" }
}

export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings>({ model: "" })
  const [mounted, setMounted] = useState(false)
  const [envBaseUrl, setEnvBaseUrl] = useState<string | null>(null)
  const [envApiKey, setEnvApiKey] = useState(false)

  useEffect(() => {
    queueMicrotask(() => {
      setSettings(loadSettings())
      setMounted(true)
    })

    apiFetch("/api/ai-config")
      .then((res) => res.json())
      .then((data) => {
        setEnvBaseUrl(data.envBaseUrl ?? null)
        setEnvApiKey(!!data.envApiKey)
      })
      .catch(() => {
        setEnvBaseUrl(null)
        setEnvApiKey(false)
      })
  }, [])

  const saveSettings = useCallback((next: AiSettings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setSettings(next)
  }, [])

  const effectiveBaseUrl = settings.overrideEnv
    ? (settings.customBaseUrl ?? "")
    : (envBaseUrl ?? "")

  const effectiveApiKey = settings.overrideEnv
    ? (settings.customApiKey ?? "")
    : ""

  const isConfigured =
    mounted &&
    effectiveBaseUrl.trim().length > 0 &&
    settings.model.trim().length > 0 &&
    (envApiKey || effectiveApiKey.trim().length > 0)

  return {
    settings,
    saveSettings,
    isConfigured,
    mounted,
    envBaseUrl,
    envApiKey,
    effectiveBaseUrl,
    effectiveApiKey,
  }
}
