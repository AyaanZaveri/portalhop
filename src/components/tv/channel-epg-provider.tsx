"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import type { EpgProgramme } from "@portalhop/shared/stalker-types"
import type { PortalChannelWithSource } from "@/lib/tv-channels"
import { useTv } from "@/components/tv/tv-provider"
import { epgChoiceKey } from "@portalhop/shared/epg-preference"
import { apiFetch } from "@/lib/api-fetch"

type ChannelEpgContextValue = {
  programmes: EpgProgramme[]
  currentProgramme: EpgProgramme | null
  now: number
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  error: string
  loadMore: () => void
}

const ChannelEpgContext = createContext<ChannelEpgContextValue | null>(null)

export function ChannelEpgProvider({
  channel,
  children,
}: {
  channel: PortalChannelWithSource
  children: ReactNode
}) {
  const { endpoint, previewSourceRequest, channelEpg } = useTv()
  const [programmes, setProgrammes] = useState<EpgProgramme[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const requestBodyRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  /**
   * The guide is the channel's, not the playing stream's.
   *
   * Every source carrying this channel describes the same broadcast, so the
   * schedule has no business changing when someone switches source for a better
   * picture. Resolving to one stream per channel also means switching source
   * does not refetch: the request below is identical either way, so the effect
   * below does not even re-run.
   */
  const epgChoice = channelEpg(channel)
  const epgStream = (epgChoice?.stream ?? channel) as PortalChannelWithSource
  // A string rather than the object, because the object is rebuilt every render
  // and the whole point is for this effect to stay still while it does.
  const epgKey = epgChoiceKey(epgChoice)

  useEffect(() => {
    const controller = new AbortController()
    const sourceRequest = epgStream.portalSource?.request ?? previewSourceRequest
    const sourceEndpoint = epgStream.portalSource?.endpoint ?? endpoint
    const requestBody = {
      ...sourceRequest,
      epgMode: epgStream.portalSource?.epgMode ?? "portal",
      epgSourceId: epgStream.portalSource?.epgSourceId ?? null,
      endpoint: sourceEndpoint,
      channelId: epgStream.id,
      channelName: epgStream.name,
      xmltvId: epgStream.xmltvId,
    }
    requestBodyRef.current = requestBody

    async function loadChannelEpg() {
      setIsLoading(true)
      setError("")
      setHasMore(false)

      try {
        const response = await apiFetch("/api/channel-epg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify(requestBody),
        })
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error || "Could not load EPG data.")
        }

        setProgrammes(
          Array.isArray(data.programmes)
            ? (data.programmes as EpgProgramme[])
            : [],
        )
        setHasMore(Boolean(data.hasMore))
      } catch (requestError) {
        if (controller.signal.aborted) return
        setProgrammes([])
        setHasMore(false)
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load EPG data.",
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadChannelEpg()
    return () => controller.abort()
    // epgKey rather than epgStream: two streams of one channel that resolve to
    // the same guide produce the same key, so switching between them leaves
    // this effect -- and the schedule on screen -- untouched.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- epgKey stands in for epgStream by construction.
  }, [epgKey, endpoint, previewSourceRequest])

  const loadMore = useCallback(async () => {
    const requestBody = requestBodyRef.current
    const lastProgramme = programmes[programmes.length - 1]
    if (!requestBody || !lastProgramme || isLoadingMore || !hasMore) return

    setIsLoadingMore(true)

    try {
      const response = await apiFetch("/api/channel-epg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ ...requestBody, from: lastProgramme.stopAt }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setHasMore(false)
        return
      }

      const nextProgrammes = Array.isArray(data.programmes)
        ? (data.programmes as EpgProgramme[])
        : []
      if (!nextProgrammes.length) {
        setHasMore(false)
        return
      }

      setProgrammes((current) => {
        const seenIds = new Set(current.map((programme) => programme.id))
        return [
          ...current,
          ...nextProgrammes.filter((programme) => !seenIds.has(programme.id)),
        ]
      })
      setHasMore(Boolean(data.hasMore))
    } catch {
      // Silent: the user can keep scrolling to retry.
    } finally {
      setIsLoadingMore(false)
    }
  }, [hasMore, isLoadingMore, programmes])

  const currentProgramme = useMemo(
    () =>
      programmes.find((programme) => {
        const start = new Date(programme.startAt).getTime()
        const stop = new Date(programme.stopAt).getTime()
        return start <= now && now < stop
      }) ?? null,
    [now, programmes],
  )

  const value = useMemo<ChannelEpgContextValue>(
    () => ({
      programmes,
      currentProgramme,
      now,
      isLoading,
      isLoadingMore,
      hasMore,
      error,
      loadMore,
    }),
    [currentProgramme, error, hasMore, isLoading, isLoadingMore, loadMore, now, programmes],
  )

  return (
    <ChannelEpgContext.Provider value={value}>
      {children}
    </ChannelEpgContext.Provider>
  )
}

export function useChannelEpg() {
  const context = useContext(ChannelEpgContext)
  if (!context) {
    throw new Error("useChannelEpg must be used within ChannelEpgProvider")
  }
  return context
}
