"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  getCastContext,
  loadCastMedia,
  type CastContext,
  type CastMedia,
} from "@/lib/google-cast"

export type GoogleCastState = "unavailable" | "idle" | "connecting" | "casting"

/**
 * Google Cast availability and session state for a single stream.
 *
 * Stays "unavailable" — and renders nothing — wherever the sender SDK doesn't
 * load, which is every browser but Chromium and every WebView build. AirPlay
 * is a separate path handled by media-chrome, since WebKit resolves the
 * receiver against the element itself.
 */
export function useGoogleCast(media: CastMedia | null) {
  const [context, setContext] = useState<CastContext | null>(null)
  const [state, setState] = useState<GoogleCastState>("unavailable")

  // Read at load time rather than tracked: a title arriving a beat after the
  // stream shouldn't re-run the session wiring.
  const mediaRef = useRef(media)
  useEffect(() => {
    mediaRef.current = media
  }, [media])

  useEffect(() => {
    let cancelled = false
    let teardown: (() => void) | undefined

    void getCastContext().then((castContext) => {
      if (cancelled || !castContext) return

      const readState = () => {
        const castState = castContext.getCastState()
        if (castState === "NO_DEVICES_AVAILABLE") return "unavailable" as const
        if (castState === "CONNECTED") return "casting" as const
        if (castState === "CONNECTING") return "connecting" as const
        return "idle" as const
      }

      const onCastStateChanged = () => setState(readState())

      castContext.addEventListener("caststatechanged", onCastStateChanged)
      setContext(castContext)
      setState(readState())

      teardown = () =>
        castContext.removeEventListener("caststatechanged", onCastStateChanged)
    })

    return () => {
      cancelled = true
      teardown?.()
    }
  }, [])

  // The picker and the load are one gesture from the viewer's side: they choose
  // a device and the channel appears on it.
  const startCasting = useCallback(async () => {
    const target = mediaRef.current
    if (!context || !target) return

    const existing = context.getCurrentSession()
    if (!existing) {
      const error = await context.requestSession()
      // A resolved string is the SDK's error code; cancelling the picker
      // reports "cancel", which isn't worth surfacing.
      if (error) return
    }

    const session = context.getCurrentSession()
    if (!session) return

    await loadCastMedia(session, target)
  }, [context])

  const stopCasting = useCallback(() => {
    context?.endCurrentSession(true)
  }, [context])

  return { state, startCasting, stopCasting }
}
