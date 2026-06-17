"use client"

import {
  FormEvent,
  ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { toast } from "sonner"
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  SaveIcon,
  SearchIcon,
  TvIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  MediaPlayer,
  MediaPlayerControls,
  MediaPlayerControlsOverlay,
  MediaPlayerError,
  MediaPlayerFullscreen,
  MediaPlayerLoading,
  MediaPlayerPiP,
  MediaPlayerPlay,
  MediaPlayerSettings,
  MediaPlayerSeek,
  MediaPlayerSeekBackward,
  MediaPlayerSeekForward,
  MediaPlayerTime,
  MediaPlayerVideo,
  MediaPlayerVolume,
  MediaPlayerVolumeIndicator,
} from "@/components/ui/media-player"
import type { PortalChannel, PortalRequest, PortalResponse } from "@/lib/stalker-types"
import type { EpgProgramme } from "@/lib/stalker-types"
import { SettingsDialog } from "@/components/settings-dialog"
import type { EpgManifest } from "@/lib/epg-store"
import { ThemeSelector } from "@/components/theme-selector"
import MuxVideo from "@mux/mux-video-react"
import { cn } from "@/lib/utils"

type FormState = PortalRequest & {
  query: string
}

type SavedPortalRecord = PortalRequest & {
  id: number
  name: string
  endpoint?: string | null
  channelCount: number
  createdAt: string | number | Date
  updatedAt: string | number | Date
}

type LoadedPortal = {
  portal: SavedPortalRecord
  response: PortalResponse
}

type PortalSource = {
  id: number
  name: string
  endpoint: string
  request: PortalRequest
}

type PortalChannelWithSource = PortalChannel & {
  portalSource?: PortalSource
}

const initialForm: FormState = {
  portalUrl: "",
  mac: "",
  serial: "",
  deviceId: "",
  deviceId2: "",
  signature: "",
  timezone: "America/Toronto",
  stbType: "MAG254",
  query: "",
}

const lastOpenedPortalStorageKey = "portalhop-last-opened-portal-id"
const openedPortalsStorageKey = "portalhop-opened-portal-ids"

export default function Home() {
  const [form, setForm] = useState<FormState>(initialForm)
  const [result, setResult] = useState<PortalResponse | null>(null)
  const [testResult, setTestResult] = useState<PortalResponse | null>(null)
  const [error, setError] = useState("")
  const [details, setDetails] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingPortalId, setLoadingPortalId] = useState<number | null>(null)
  const [refetchingPortalId, setRefetchingPortalId] = useState<number | null>(
    null
  )
  const [savedPortals, setSavedPortals] = useState<SavedPortalRecord[]>([])
  const [loadedPortals, setLoadedPortals] = useState<Record<number, LoadedPortal>>({})
  const [isLoadingPortals, setIsLoadingPortals] = useState(true)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [portalName, setPortalName] = useState("")
  const [saveError, setSaveError] = useState("")
  const [isSavingPortal, setIsSavingPortal] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [logoSource, setLogoSource] = useState<"provider" | "epg">(() => {
    if (typeof window !== "undefined") {
      const savedSettings = localStorage.getItem("portalhop-settings")
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings)
          if (parsed.logoSource === "epg" || parsed.logoSource === "provider") {
            return parsed.logoSource
          }
        } catch (e) {
          console.error("Failed to parse settings from localStorage:", e)
        }
      }
    }
    return "provider"
  })
  const [epgManifest, setEpgManifest] = useState<EpgManifest | null>(null)
  const [epgChannels, setEpgChannels] = useState<Record<string, { name: string; logoUrl?: string; countryCode?: string }>>({})

  const fetchEpgChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/epg/channels")
      if (!res.ok) throw new Error("Failed to fetch EPG channels")
      const channels = await res.json()
      setEpgChannels(channels)
    } catch (err) {
      console.error("Failed to load EPG channels:", err)
    }
  }, [])



  useEffect(() => {

    async function initEpg() {
      try {
        const res = await fetch("/api/epg")
        if (!res.ok) throw new Error("Failed to fetch manifest")
        const manifest: EpgManifest = await res.json()
        setEpgManifest(manifest)

        const isStale = !manifest.lastFetchedAt || (Date.now() - manifest.lastFetchedAt > 6 * 60 * 60 * 1000)
        const isEmpty = manifest.countries.length === 0

        if (isStale || isEmpty) {
          console.log("EPG data is stale or empty. Triggering background refetch...")
          fetch("/api/epg", { method: "POST" })
            .then(async (postRes) => {
              if (postRes.ok) {
                const newManifest = await postRes.json()
                setEpgManifest(newManifest)
                fetchEpgChannels()
              }
            })
            .catch((err) => console.error("Background EPG refetch failed:", err))
        }
      } catch (err) {
        console.error("Failed to initialize EPG:", err)
      }
    }

    initEpg()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEpgChannels()
  }, [fetchEpgChannels])

  const handleLogoSourceChange = (source: "provider" | "epg") => {
    setLogoSource(source)
    localStorage.setItem("portalhop-settings", JSON.stringify({ logoSource: source }))
  }

  const handleEpgRefetchComplete = async () => {
    try {
      const res = await fetch("/api/epg")
      if (res.ok) {
        const manifest = await res.json()
        setEpgManifest(manifest)
      }
      await fetchEpgChannels()
    } catch (err) {
      console.error("Failed to update manifest/channels after refetch:", err)
    }
  }

  const deferredQuery = useDeferredValue(form.query)
  const portalRequest = useMemo<PortalRequest>(
    () => ({
      portalUrl: form.portalUrl,
      mac: form.mac,
      serial: form.serial,
      deviceId: form.deviceId,
      deviceId2: form.deviceId2,
      signature: form.signature,
      timezone: form.timezone,
      stbType: form.stbType,
    }),
    [
      form.deviceId,
      form.deviceId2,
      form.mac,
      form.portalUrl,
      form.serial,
      form.signature,
      form.stbType,
      form.timezone,
    ]
  )

  const activePortalIds = useMemo(
    () => Object.keys(loadedPortals).map((id) => Number(id)),
    [loadedPortals]
  )

  const loadedPortalChannels = useMemo<PortalChannelWithSource[]>(() => {
    return Object.values(loadedPortals).flatMap(({ portal, response }) => {
      const portalSource = getPortalSource(portal)

      return response.channels.map((channel) => ({
        ...channel,
        portalSource,
      }))
    })
  }, [loadedPortals])

  const browserChannels = useMemo<PortalChannelWithSource[]>(() => {
    if (loadedPortalChannels.length) {
      return loadedPortalChannels
    }

    return result?.channels ?? []
  }, [loadedPortalChannels, result])

  const searchableChannels = useMemo(() => {
    return browserChannels.map((channel) => ({
      channel,
      searchText: [
        channel.number,
        channel.name,
        channel.xmltvId,
        channel.genre,
        channel.cmd,
        channel.portalSource?.name,
      ]
        .join(" ")
        .toLowerCase(),
    }))
  }, [browserChannels])

  const filteredChannels = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase()

    if (!query) {
      return browserChannels
    }

    return searchableChannels
      .filter((entry) => entry.searchText.includes(query))
      .map((entry) => entry.channel)
  }, [browserChannels, deferredQuery, searchableChannels])

  useEffect(() => {
    let isMounted = true

    async function loadSavedPortals() {
      setIsLoadingPortals(true)
      try {
        const response = await fetch("/api/portals", { cache: "no-store" })
        const data = await response.json().catch(() => ({ portals: [] }))
        const portals = Array.isArray(data.portals)
          ? (data.portals as SavedPortalRecord[])
          : []

        if (!isMounted) {
          return
        }

        setSavedPortals(portals)

        const openedPortalIds = readOpenedPortalIds()
        const lastOpenedPortalId = localStorage.getItem(lastOpenedPortalStorageKey)
        const portalIdsToOpen = openedPortalIds.length
          ? openedPortalIds
          : lastOpenedPortalId
            ? [Number(lastOpenedPortalId)]
            : []
        const portalsToOpen = portals.filter((portal) =>
          portalIdsToOpen.includes(portal.id)
        )

        if (!portalsToOpen.length) {
          return
        }

        setError("")
        setDetails([])

        for (const portal of portalsToOpen) {
          if (!isMounted) {
            return
          }

          setLoadingPortalId(portal.id)

          try {
            const portalResult = await fetchSavedPortalResult(portal)

            if (!isMounted) {
              return
            }

            setLoadedPortals((current) => ({
              ...current,
              [portal.id]: {
                portal,
                response: portalResult,
              },
            }))
          } catch (error) {
            if (!isMounted) {
              return
            }

            setError(
              error instanceof Error
                ? error.message
                : "Could not load a saved portal."
            )
          } finally {
            if (isMounted) {
              setLoadingPortalId(null)
            }
          }
        }

        persistOpenedPortalIds(portalsToOpen.map((portal) => portal.id))
      } catch (error) {
        if (!isMounted) {
          return
        }

        setError(
          error instanceof Error
            ? error.message
            : "Could not load saved portals."
        )
      } finally {
        if (isMounted) {
          setIsLoadingPortals(false)
        }
      }
    }

    loadSavedPortals()

    return () => {
      isMounted = false
    }
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError("")
    setDetails([])
    setTestResult(null)

    try {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalUrl: form.portalUrl,
          mac: form.mac,
          serial: form.serial,
          deviceId: form.deviceId,
          deviceId2: form.deviceId2,
          signature: form.signature,
          timezone: form.timezone,
          stbType: form.stbType,
        }),
      })

      const data = await response.json()
      setIsLoading(false)

      if (!response.ok) {
        const errMsg = data.error || "The portal request failed."
        setError(errMsg)
        setDetails(Array.isArray(data.details) ? data.details : [])
        toast.error(`Connection failed: ${errMsg}`)
        return
      }

      setTestResult(data)
      toast.success("Connection test successful!")
    } catch (err) {
      setIsLoading(false)
      const errMsg = err instanceof Error ? err.message : "An unexpected error occurred."
      setError(errMsg)
      toast.error(`Connection failed: ${errMsg}`)
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setTestResult(null)
  }

  async function loadSavedPortal(
    portal: SavedPortalRecord,
    options: { persist?: boolean } = {}
  ) {
    const { persist = true } = options

    setLoadingPortalId(portal.id)
    setError("")
    setDetails([])

    try {
      const portalResult = await fetchSavedPortalResult(portal)

      setResult(null)
      setLoadedPortals((current) => {
        const next = {
          ...current,
          [portal.id]: {
            portal,
            response: portalResult,
          },
        }

        if (persist) {
          persistOpenedPortalIds(Object.keys(next).map((id) => Number(id)))
        }

        return next
      })
      localStorage.setItem(lastOpenedPortalStorageKey, String(portal.id))
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load this saved portal."
      )
    } finally {
      setLoadingPortalId(null)
    }
  }

  function unloadSavedPortal(portal: SavedPortalRecord) {
    setLoadedPortals((current) => {
      const next = { ...current }
      delete next[portal.id]
      persistOpenedPortalIds(Object.keys(next).map((id) => Number(id)))
      return next
    })
  }

  async function handlePortalCheckedChange(
    portal: SavedPortalRecord,
    checked: boolean
  ) {
    if (checked) {
      await loadSavedPortal(portal)
      return
    }

    unloadSavedPortal(portal)
  }

  async function refetchSavedPortal(portal: SavedPortalRecord) {
    setRefetchingPortalId(portal.id)
    setError("")
    setDetails([])
    const toastId = toast.loading(`Refetching ${portal.name}...`)

    try {
      const response = await fetch(`/api/portals/${portal.id}/refetch`, {
        method: "POST",
      })
      const data = await response.json().catch(() => ({}))
      setRefetchingPortalId(null)

      if (!response.ok) {
        setError(data.error || "Could not refetch this saved portal.")
        setDetails(Array.isArray(data.details) ? data.details : [])
        toast.error(`Failed to refetch ${portal.name}`, { id: toastId })
        return
      }

      if (data.portal) {
        setSavedPortals((current) =>
          current.map((item) => (item.id === portal.id ? data.portal : item))
        )
      }

      if (data.result) {
        const refreshedPortal = {
          ...portal,
          ...(data.portal ?? {}),
        }
        setLoadedPortals((current) => {
          if (!current[refreshedPortal.id]) {
            return current
          }

          return {
            ...current,
            [refreshedPortal.id]: {
              portal: refreshedPortal,
              response: data.result,
            },
          }
        })
      }
      toast.success(`${portal.name} refetched successfully`, { id: toastId })
    } catch {
      setRefetchingPortalId(null)
      toast.error(`Failed to refetch ${portal.name}`, { id: toastId })
    }
  }

  async function saveCurrentPortal() {
    const activeResult = result || testResult
    if (!activeResult) {
      return
    }

    const name = portalName.trim()

    if (!name) {
      setSaveError("Add a nickname first.")
      return
    }

    setIsSavingPortal(true)
    setSaveError("")

    const response = await fetch("/api/portals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...portalRequest,
        name,
        endpoint: activeResult.endpoint,
        channelCount: activeResult.channels.length,
        channels: activeResult.channels,
      }),
    })
    const data = await response.json().catch(() => ({}))
    setIsSavingPortal(false)

    if (!response.ok) {
      setSaveError(data.error || "Could not save this portal.")
      return
    }

    if (data.portal) {
      setSavedPortals((current) => [data.portal, ...current])
      setResult(null)
      setLoadedPortals((current) => {
        const portal = data.portal as SavedPortalRecord
        const next = {
          ...current,
          [portal.id]: {
            portal,
            response: activeResult,
          },
        }
        persistOpenedPortalIds(Object.keys(next).map((id) => Number(id)))
        return next
      })
      localStorage.setItem(lastOpenedPortalStorageKey, String(data.portal.id))
    }

    setPortalName("")
    setSaveDialogOpen(false)
  }

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <div className="relative h-full w-full">
        <Sheet
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open)
            if (!open) {
              setTestResult(null)
            }
          }}
        >
          <SheetContent className="gap-0 backdrop-blur-md sm:max-w-xl! dark:bg-background/50">
            <SheetHeader>
              <SheetTitle>Connection</SheetTitle>
              <SheetDescription>
                Enter the Stalker portal URL and your device identity details below.
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={onSubmit} className="flex flex-col flex-1 gap-0 overflow-hidden">
              <ScrollArea className="min-h-0 flex-1">
                <div className="px-4 pt-0 pb-4">
                  <FieldGroup>
                    <div className="grid gap-4">
                      <Field>
                        <FieldLabel htmlFor="portalUrl">Portal URL</FieldLabel>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">URL</InputGroupAddon>
                          <InputGroupInput
                            id="portalUrl"
                            required
                            inputMode="url"
                            placeholder="http://example.com:8080/c/"
                            value={form.portalUrl}
                            onChange={(event) =>
                              updateField("portalUrl", event.target.value)
                            }
                          />
                        </InputGroup>

                      </Field>

                      <Field>
                        <FieldLabel htmlFor="mac">MAC address</FieldLabel>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">MAC</InputGroupAddon>
                          <InputGroupInput
                            id="mac"
                            required
                            placeholder="00:1A:79:00:00:00"
                            value={form.mac}
                            onChange={(event) => updateField("mac", event.target.value)}
                          />
                        </InputGroup>

                      </Field>

                      <Accordion className="w-full">
                        <AccordionItem value="advanced" className="border-none">
                          <AccordionTrigger className="hover:no-underline text-xs text-muted-foreground p-0 py-2">
                            Show advanced
                          </AccordionTrigger>
                          <AccordionContent className="pt-2">
                            <div className="grid gap-4 pt-1 pb-1">
                              <SimpleInput
                                id="serial"
                                label="Serial number"
                                placeholder="Optional"
                                value={form.serial}
                                onChange={(value) => updateField("serial", value)}
                              />
                              <SimpleInput
                                id="deviceId"
                                label="Device ID"
                                placeholder="Optional"
                                value={form.deviceId}
                                onChange={(value) => updateField("deviceId", value)}
                              />
                              <SimpleInput
                                id="deviceId2"
                                label="Device ID 2"
                                placeholder="Optional"
                                value={form.deviceId2}
                                onChange={(value) => updateField("deviceId2", value)}
                              />
                              <SimpleInput
                                id="signature"
                                label="Signature"
                                placeholder="Optional"
                                value={form.signature}
                                onChange={(value) => updateField("signature", value)}
                              />
                              <SimpleInput
                                id="timezone"
                                label="Timezone"
                                placeholder="America/Toronto"
                                value={form.timezone}
                                onChange={(value) => updateField("timezone", value)}
                              />
                              <SimpleInput
                                id="stbType"
                                label="STB model"
                                placeholder="MAG254"
                                value={form.stbType}
                                onChange={(value) => updateField("stbType", value)}
                              />
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>
                  </FieldGroup>

                  {error ? (
                    <Alert variant="destructive" className="mt-6">
                      <AlertCircleIcon />
                      <AlertTitle>Connection failed</AlertTitle>
                      <AlertDescription>
                        <div className="flex flex-col gap-2">
                          <span>{error}</span>
                          {details.length ? (
                            <Accordion className="w-full">
                              <AccordionItem value="attempts" className="border-none">
                                <AccordionTrigger className="hover:no-underline text-xs text-destructive-foreground/80 hover:text-destructive-foreground p-0 py-1 font-medium">
                                  Endpoint attempts
                                </AccordionTrigger>
                                <AccordionContent className="pb-0">
                                  <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-destructive-foreground/70">
                                    {details.map((detail) => (
                                      <li key={detail}>{detail}</li>
                                    ))}
                                  </ul>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          ) : null}
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              </ScrollArea>

              <SheetFooter className="border-t pt-4 flex-row! justify-end gap-2">
                {testResult ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setPortalName(testResult.profile.login || "")
                        setSaveError("")
                        setSaveDialogOpen(true)
                      }}
                    >
                      <SaveIcon data-icon="inline-start" />
                      Save
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setLoadedPortals({})
                        persistOpenedPortalIds([])
                        setResult(testResult)
                        setSheetOpen(false)
                      }}
                      className="cursor-pointer"
                    >
                      <ArrowRightIcon data-icon="inline-start" />
                      View
                    </Button>
                  </>
                ) : (
                  <Button type="submit" disabled={isLoading} className="cursor-pointer">
                    {isLoading ? (
                      <Loader2Icon data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <ArrowRightIcon data-icon="inline-start" />
                    )}
                    Test
                  </Button>
                )}
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>

        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent>
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Save portal</DialogTitle>
                <DialogDescription>
                  Add a nickname for this portal so you can load it later.
                </DialogDescription>
              </DialogHeader>

              <Field data-invalid={Boolean(saveError)}>
                <FieldLabel htmlFor="portalName">Nickname</FieldLabel>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <TvIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="portalName"
                    placeholder="Living room IPTV"
                    value={portalName}
                    aria-invalid={Boolean(saveError)}
                    onChange={(event) =>
                      setPortalName(event.target.value)
                    }
                  />
                </InputGroup>
                {saveError ? (
                  <FieldDescription>{saveError}</FieldDescription>
                ) : null}
              </Field>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSaveDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isSavingPortal}
                  onClick={saveCurrentPortal}
                >
                  {isSavingPortal ? (
                    <Loader2Icon
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <SaveIcon data-icon="inline-start" />
                  )}
                  Save
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {!browserChannels.length ? (
          <div className="absolute top-5 right-5 z-20 flex items-center gap-1 rounded-xl bg-background/85 p-1 shadow-sm backdrop-blur">
            <SettingsDialog
              open={settingsDialogOpen}
              onOpenChange={setSettingsDialogOpen}
              logoSource={logoSource}
              onLogoSourceChange={handleLogoSourceChange}
              epgManifest={epgManifest}
              onRefetchComplete={handleEpgRefetchComplete}
              savedPortals={savedPortals}
              activePortalIds={activePortalIds}
              isLoadingPortals={isLoadingPortals}
              loadingPortalId={loadingPortalId}
              refetchingPortalId={refetchingPortalId}
              onAddPortal={() => setSheetOpen(true)}
              onPortalCheckedChange={handlePortalCheckedChange}
              onRefetchPortal={refetchSavedPortal}
            />
            <ThemeSelector />
          </div>
        ) : null}

        {isLoadingPortals ? (
          <LoadingShell />
        ) : browserChannels.length ? (
          <ChannelBrowser
            channels={filteredChannels}
            endpoint={result?.endpoint ?? ""}
            portalRequest={portalRequest}
            logoSource={logoSource}
            epgChannels={epgChannels}
            query={form.query}
            onQueryChange={(value) => updateField("query", value)}
            utilityControls={
              <>
                <SettingsDialog
                  open={settingsDialogOpen}
                  onOpenChange={setSettingsDialogOpen}
                  logoSource={logoSource}
                  onLogoSourceChange={handleLogoSourceChange}
                  epgManifest={epgManifest}
                  onRefetchComplete={handleEpgRefetchComplete}
                  savedPortals={savedPortals}
                  activePortalIds={activePortalIds}
                  isLoadingPortals={isLoadingPortals}
                  loadingPortalId={loadingPortalId}
                  refetchingPortalId={refetchingPortalId}
                  onAddPortal={() => setSheetOpen(true)}
                  onPortalCheckedChange={handlePortalCheckedChange}
                  onRefetchPortal={refetchSavedPortal}
                />
                <ThemeSelector />
              </>
            }
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <TvIcon className="size-8 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">No channels loaded</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Add a portal to start browsing channels.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function SimpleInput({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  value?: string
  onChange: (value: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      </InputGroup>
    </Field>
  )
}

function ChannelBrowser({
  channels,
  endpoint,
  portalRequest,
  logoSource,
  epgChannels,
  query,
  onQueryChange,
  utilityControls,
}: {
  channels: PortalChannelWithSource[]
  endpoint: string
  portalRequest: PortalRequest
  logoSource: "provider" | "epg"
  epgChannels: Record<string, { name: string; logoUrl?: string; countryCode?: string }>
  query: string
  onQueryChange: (value: string) => void
  utilityControls: ReactNode
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [copiedChannel, setCopiedChannel] = useState("")
  const [resolvingChannel, setResolvingChannel] = useState("")
  const [failedChannel, setFailedChannel] = useState("")
  const [selectedChannel, setSelectedChannel] =
    useState<PortalChannelWithSource | null>(null)
  const [epgProgrammes, setEpgProgrammes] = useState<EpgProgramme[]>([])
  const [isLoadingEpg, setIsLoadingEpg] = useState(false)
  const [epgError, setEpgError] = useState("")
  const [playerStream, setPlayerStream] = useState<{
    channelKey: string
    channelName: string
    genre: string
    logoUrl: string
    number: string
    portalName: string
    url: string
  } | null>(null)
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual intentionally returns imperative helpers for scroll math.
  const rowVirtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () =>
      scrollAreaRef.current?.querySelector<HTMLElement>(
        "[data-slot='scroll-area-viewport']"
      ) ?? null,
    estimateSize: () => 64,
    overscan: 12,
  })

  useEffect(() => {
    rowVirtualizer.scrollToIndex(0)
  }, [channels, rowVirtualizer])

  useEffect(() => {
    if (!selectedChannel || !playerStream) {
      setEpgProgrammes([])
      setEpgError("")
      setIsLoadingEpg(false)
      return
    }

    const controller = new AbortController()
    const sourceRequest = selectedChannel.portalSource?.request ?? portalRequest
    const sourceEndpoint = selectedChannel.portalSource?.endpoint ?? endpoint

    async function loadChannelEpg() {
      setIsLoadingEpg(true)
      setEpgError("")

      try {
        const response = await fetch("/api/channel-epg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            ...sourceRequest,
            source: logoSource,
            endpoint: sourceEndpoint,
            channelId: selectedChannel?.id,
            channelName: selectedChannel?.name,
            xmltvId: selectedChannel?.xmltvId,
          }),
        })
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error || "Could not load EPG data.")
        }

        setEpgProgrammes(
          Array.isArray(data.programmes) ? (data.programmes as EpgProgramme[]) : []
        )
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setEpgProgrammes([])
        setEpgError(error instanceof Error ? error.message : "Could not load EPG data.")
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingEpg(false)
        }
      }
    }

    loadChannelEpg()

    return () => {
      controller.abort()
    }
  }, [endpoint, logoSource, playerStream, portalRequest, selectedChannel])

  async function pullChannelStream(
    channel: PortalChannelWithSource,
    action: "copy" | "open" | "play" = "play"
  ) {
    const channelKey = getChannelKey(channel)
    const sourceRequest = channel.portalSource?.request ?? portalRequest
    const sourceEndpoint = channel.portalSource?.endpoint ?? endpoint

    if (!canResolveChannel(channel)) {
      return
    }

    setResolvingChannel(channelKey)
    setFailedChannel("")
    const toastId = toast.loading(`Pulling ${channel.name || "stream"}`, {
      description: "Resolving the latest stream from the portal.",
    })

    try {
      const response = await fetch("/api/channel-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          ...sourceRequest,
          endpoint: sourceEndpoint,
          cmd: channel.cmd,
          channelId: channel.id,
          channelNumber: channel.number,
          channelName: channel.name,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok || typeof data.link !== "string" || !data.link) {
        throw new Error(data.error || "Could not pull the latest stream.")
      }

      if (action === "copy") {
        await navigator.clipboard.writeText(data.link)
        setCopiedChannel(channelKey)
        window.setTimeout(() => setCopiedChannel(""), 1400)
        toast.dismiss(toastId)
        toast.success("Copied stream", {
          description: channel.name,
          icon: <CheckIcon className="size-4 text-foreground" />,
        })
      } else if (action === "open") {
        window.location.href = `iina://weblink?url=${encodeURIComponent(
          data.link
        )}`
        toast.dismiss(toastId)
        toast.success("Opening in IINA", {
          description: channel.name,
          icon: <CheckIcon className="size-4 text-foreground" />,
        })
      } else {
        setSelectedChannel(channel)
        setPlayerStream({
          channelKey,
          channelName: channel.name || "Live stream",
          genre: channel.genre,
          logoUrl: getChannelLogoUrl(channel, logoSource, epgChannels),
          number: channel.number,
          portalName: channel.portalSource?.name ?? "",
          url: data.link,
        })
        toast.dismiss(toastId)
      }
    } catch (error) {
      setFailedChannel(channelKey)
      window.setTimeout(() => setFailedChannel(""), 1800)
      toast.dismiss(toastId)
      toast.error("Could not pull stream", {
        description: error instanceof Error ? error.message : channel.name,
      })
    } finally {
      setResolvingChannel("")
    }
  }

  return (
    <>
      <div className="absolute top-5 right-5 z-20 flex items-center gap-2 rounded-xl bg-background/85 p-1 shadow-sm backdrop-blur">
        {playerStream && selectedChannel ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(resolvingChannel)}
              onClick={() => pullChannelStream(selectedChannel, "open")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- IINA icon is a local public asset */}
              <img src="/iina.png" alt="" className="size-4 scale-125 object-contain" />
              Open in IINA
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(resolvingChannel)}
              onClick={() => pullChannelStream(selectedChannel, "copy")}
            >
              {copiedChannel === getChannelKey(selectedChannel) ? (
                <CheckIcon data-icon="inline-start" />
              ) : failedChannel === getChannelKey(selectedChannel) ? (
                <AlertCircleIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              Copy stream
            </Button>
          </>
        ) : null}
        <div className="flex items-center gap-1">{utilityControls}</div>
      </div>
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full gap-1.5 overflow-hidden bg-muted/30 p-3"
        resizeTargetMinimumSize={{ coarse: 44, fine: 12 }}
      >
        <ResizablePanel defaultSize="360px" minSize="320px" maxSize="520px">
          <div className="flex h-full min-w-80 flex-col overflow-hidden rounded-2xl bg-card shadow-sm">
            <div className="flex flex-col gap-3 p-4 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">Live Streams</p>
                  <p className="text-xs text-muted-foreground">
                    {channels.length.toLocaleString()} visible
                  </p>
                </div>
              </div>
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Search channels"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                />
              </InputGroup>
            </div>
            <ScrollArea
              ref={scrollAreaRef}
              className="min-h-0 flex-1 px-2 pb-2"
              aria-rowcount={channels.length}
            >
              {channels.length ? (
                <div
                  className="relative"
                  style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const channel = channels[virtualRow.index]
                    const channelKey = getChannelKey(channel)
                    const canResolve = canResolveChannel(channel)
                    const isResolving = resolvingChannel === channelKey
                    const isSelected =
                      selectedChannel && getChannelKey(selectedChannel) === channelKey
                    const logoUrl = getChannelLogoUrl(channel, logoSource, epgChannels)
                    const channelBadgeId = channel.xmltvId ?? ""

                    return (
                      <button
                        key={`${channel.id}-${channel.number}-${virtualRow.index}`}
                        type="button"
                        disabled={!canResolve || Boolean(resolvingChannel)}
                        className={cn(
                          "absolute inset-x-0 flex items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors hover:bg-accent/80 disabled:pointer-events-none disabled:opacity-50",
                          isSelected && "bg-accent shadow-xs"
                        )}
                        onClick={() => pullChannelStream(channel)}
                        style={{
                          height: `${virtualRow.size - 8}px`,
                          transform: `translateY(${virtualRow.start + 4}px)`,
                        }}
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-950 p-1 shadow-inner">
                          {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- Portal/EPG logos can come from arbitrary hosts.
                            <img
                              src={logoUrl}
                              alt=""
                              className="size-full rounded object-contain"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <TvIcon className="text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate font-medium">
                            {channel.name || `Channel ${channel.number || virtualRow.index + 1}`}
                          </span>
                          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">
                              {channel.genre || "Uncategorized"}
                            </span>
                            {channel.portalSource ? (
                              <Badge
                                variant="outline"
                                className="h-4 max-w-28 rounded px-1.5 text-[10px]"
                              >
                                <span className="truncate">
                                  {channel.portalSource.name}
                                </span>
                              </Badge>
                            ) : null}
                            {channelBadgeId ? (
                              <Badge
                                variant="secondary"
                                className="h-4 max-w-28 rounded px-1.5 font-mono text-[10px]"
                              >
                                <span className="truncate">{channelBadgeId}</span>
                              </Badge>
                            ) : null}
                          </span>
                        </div>
                        {isResolving ? <Spinner /> : null}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  No channels matched the current search.
                </div>
              )}
            </ScrollArea>
          </div>
        </ResizablePanel>
        <ResizableHandle className="w-0 bg-transparent after:w-1 focus-visible:ring-0" />
        <ResizablePanel minSize="560px">
          <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-background">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-4 pr-[28rem]">
              {playerStream ? (
                <div className="flex min-w-0 items-center gap-3">
                  {playerStream.logoUrl ? (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-950 p-1 shadow-inner">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Channel logos can come from arbitrary provider or EPG hosts. */}
                      <img
                        src={playerStream.logoUrl}
                        alt=""
                        className="size-full rounded object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : null}
                  <div className="flex min-w-0 flex-col">
                    <p className="truncate font-semibold">{playerStream.channelName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {playerStream.genre || "Uncategorized"}
                      {playerStream.portalName ? ` • ${playerStream.portalName}` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  <p className="font-semibold">Select a channel</p>
                  <p className="text-sm text-muted-foreground">
                    Pick a channel from the sidebar to start playback.
                  </p>
                </div>
              )}
            </div>
            {playerStream ? (
              <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pt-4">
                  <MediaPlayer
                    key={`${playerStream.channelKey}-${playerStream.url}`}
                    autoHide
                    className="aspect-video w-full overflow-hidden rounded-lg bg-black"
                  >
                    <MediaPlayerVideo
                      render={
                        <MuxVideo
                          src={playerStream.url}
                          type="hls"
                          streamType="live"
                          preferPlayback="mse"
                          preload="auto"
                          targetLiveWindow={30}
                          autoPlay
                          playsInline
                          envKey={process.env.NEXT_PUBLIC_MUX_ENV_KEY}
                          metadata={{
                            video_id: playerStream.channelKey,
                            video_title: playerStream.channelName,
                            video_stream_type: "live",
                          }}
                          className="h-full w-full bg-black object-contain"
                        />
                      }
                    />
                    <MediaPlayerLoading />
                    <MediaPlayerError />
                    <MediaPlayerVolumeIndicator />
                    <MediaPlayerControls className="flex-col items-start gap-2.5 px-4 pb-3">
                      <MediaPlayerControlsOverlay />
                      <div className="flex w-full items-center gap-3 pb-1">
                        {playerStream.logoUrl ? (
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-950 p-1 shadow-inner">
                            {/* eslint-disable-next-line @next/next/no-img-element -- Channel logos can come from arbitrary provider or EPG hosts. */}
                            <img
                              src={playerStream.logoUrl}
                              alt=""
                              className="size-full rounded object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : null}
                        <div className="flex min-w-0 flex-col">
                          <h2 className="truncate text-2xl font-semibold text-white">
                            {playerStream.channelName}
                          </h2>
                          <div className="flex min-w-0 items-center gap-2 text-sm text-white/60">
                            {playerStream.genre ? (
                              <span className="truncate font-medium">
                                {playerStream.genre}
                              </span>
                            ) : null}
                            {playerStream.portalName ? (
                              <Badge
                                variant="outline"
                                className="h-5 border-white/20 bg-white/10 text-white backdrop-blur"
                              >
                                {playerStream.portalName}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <MediaPlayerSeek />
                      <div className="flex w-full items-center gap-2">
                        <div className="flex flex-1 items-center gap-2">
                          <MediaPlayerPlay />
                          <MediaPlayerSeekBackward>
                            <RotateCcwIcon />
                          </MediaPlayerSeekBackward>
                          <MediaPlayerSeekForward>
                            <RotateCwIcon />
                          </MediaPlayerSeekForward>
                          <MediaPlayerTime />
                        </div>
                        <div className="flex items-center gap-2">
                          <MediaPlayerVolume expandable />
                          <MediaPlayerSettings />
                          <MediaPlayerPiP />
                          <MediaPlayerFullscreen />
                        </div>
                      </div>
                    </MediaPlayerControls>
                  </MediaPlayer>
                  <EpgSchedule
                    programmes={epgProgrammes}
                    isLoading={isLoadingEpg}
                    error={epgError}
                  />
                </div>
              </ScrollArea>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
                <div className="flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <TvIcon className="size-8" />
                  <p className="text-sm">No channel selected.</p>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  )
}

function canResolveChannel(channel: PortalChannel) {
  return Boolean(channel.id || channel.number || channel.name || channel.cmd)
}

function EpgSchedule({
  programmes,
  isLoading,
  error,
}: {
  programmes: EpgProgramme[]
  isLoading: boolean
  error: string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <TvIcon className="size-5 shrink-0 text-muted-foreground" />
          <span className="text-lg font-semibold">Programme Guide</span>
        </div>
        {programmes[0] ? (
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {formatScheduleDate(programmes[0].startAt)}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex h-28 items-center justify-center rounded-md bg-muted/20 text-sm text-muted-foreground">
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          Loading EPG
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : programmes.length ? (
        <div className="flex flex-col gap-3">
          {programmes.map((programme) => {
            const start = new Date(programme.startAt).getTime()
            const stop = new Date(programme.stopAt).getTime()
            const isLive = start <= now && stop > now
            const progress = isLive
              ? Math.min(100, Math.max(0, ((now - start) / (stop - start)) * 100))
              : 0

            return (
              <article
                key={programme.id}
                className="rounded-md bg-muted/20 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span>
                        {formatTimeRange(programme.startAt, programme.stopAt)}
                      </span>
                      {isLive ? (
                        <Badge className="h-5 text-[10px]">LIVE</Badge>
                      ) : null}
                      {programme.category ? (
                        <Badge variant="outline" className="h-5">
                          {programme.category}
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="truncate text-base font-semibold">
                      {programme.title}
                    </h3>
                    {programme.description ? (
                      <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {programme.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                {isLive ? (
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-md bg-muted/20 px-4 text-center text-sm text-muted-foreground">
          No programme information available for this channel.
        </div>
      )}
    </section>
  )
}

function getChannelKey(channel: PortalChannelWithSource) {
  return [
    channel.portalSource?.id ?? "manual",
    channel.id || channel.number || channel.name,
  ].join(":")
}

function getPortalSource(portal: SavedPortalRecord): PortalSource {
  return {
    id: portal.id,
    name: portal.name,
    endpoint: portal.endpoint || "",
    request: {
      portalUrl: portal.portalUrl,
      mac: portal.mac,
      serial: portal.serial ?? "",
      deviceId: portal.deviceId ?? "",
      deviceId2: portal.deviceId2 ?? "",
      signature: portal.signature ?? "",
      timezone: portal.timezone,
      stbType: portal.stbType,
    },
  }
}

async function fetchSavedPortalResult(
  portal: SavedPortalRecord
): Promise<PortalResponse> {
  const response = await fetch(`/api/portals/${portal.id}`, {
    cache: "no-store",
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || "Could not load this saved portal.")
  }

  const channels = Array.isArray(data.channels) ? data.channels : []

  return {
    endpoint: portal.endpoint || "",
    profile: {},
    genres: uniqueGenres(channels),
    channels,
  }
}

function readOpenedPortalIds() {
  const storedValue = localStorage.getItem(openedPortalsStorageKey)

  if (!storedValue) {
    return []
  }

  try {
    const parsed = JSON.parse(storedValue)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value))
  } catch {
    return []
  }
}

function persistOpenedPortalIds(portalIds: number[]) {
  const uniqueIds = [...new Set(portalIds)].filter((id) =>
    Number.isInteger(id)
  )

  if (uniqueIds.length) {
    localStorage.setItem(openedPortalsStorageKey, JSON.stringify(uniqueIds))
    localStorage.setItem(
      lastOpenedPortalStorageKey,
      String(uniqueIds[uniqueIds.length - 1])
    )
    return
  }

  localStorage.removeItem(openedPortalsStorageKey)
  localStorage.removeItem(lastOpenedPortalStorageKey)
}

function getChannelLogoUrl(
  channel: PortalChannel,
  logoSource: "provider" | "epg",
  epgChannels: Record<string, { name: string; logoUrl?: string; countryCode?: string }>
) {
  const lookupId = channel.xmltvId || channel.id

  return (
    (logoSource === "epg" && lookupId
      ? epgChannels[lookupId.toLowerCase()]?.logoUrl
      : null) ||
    channel.logoUrl ||
    ""
  )
}

function formatTimeRange(startAt: string, stopAt: string) {
  return `${formatClockTime(startAt)} - ${formatClockTime(stopAt)}`
}

function formatClockTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value))
}

function uniqueGenres(channels: PortalChannel[]) {
  const genres = new Map<string, { id: string; title: string }>()

  for (const channel of channels) {
    if (channel.genreId || channel.genre) {
      genres.set(channel.genreId || channel.genre, {
        id: channel.genreId,
        title: channel.genre || "Uncategorized",
      })
    }
  }

  return [...genres.values()]
}

function LoadingShell() {
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full gap-1.5 overflow-hidden bg-muted/30 p-3"
      resizeTargetMinimumSize={{ coarse: 44, fine: 12 }}
    >
      <ResizablePanel defaultSize="360px" minSize="320px" maxSize="520px">
        <div className="flex h-full min-w-80 flex-col overflow-hidden rounded-2xl bg-card shadow-sm">
          <div className="flex flex-col gap-3 p-4 pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
            {Array.from({ length: 14 }).map((_, index) => (
              <div
                key={index}
                className="mb-2 flex h-14 items-center gap-3 rounded-xl px-3"
              >
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle className="w-0 bg-transparent after:w-1 focus-visible:ring-0" />
      <ResizablePanel minSize="560px">
        <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-background">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-4 pr-[28rem]">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex min-w-0 flex-col gap-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <TvIcon className="size-8" />
              <p className="text-sm">No channel selected.</p>
            </div>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
