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
  const [activePortalId, setActivePortalId] = useState<number | null>(null)
  const [isLoadingPortals, setIsLoadingPortals] = useState(true)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [portalName, setPortalName] = useState("")
  const [saveError, setSaveError] = useState("")
  const [isSavingPortal, setIsSavingPortal] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
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
  const [epgChannels, setEpgChannels] = useState<Record<string, { name: string; logoUrl?: string }>>({})

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

  const searchableChannels = useMemo(() => {
    return (
      result?.channels.map((channel) => ({
        channel,
        searchText: [channel.number, channel.name, channel.genre, channel.cmd]
          .join(" ")
          .toLowerCase(),
      })) ?? []
    )
  }, [result])

  const filteredChannels = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase()

    if (!result || !query) {
      return result?.channels ?? []
    }

    return searchableChannels
      .filter((entry) => entry.searchText.includes(query))
      .map((entry) => entry.channel)
  }, [deferredQuery, result, searchableChannels])

  useEffect(() => {
    let isMounted = true

    async function loadSavedPortals() {
      setIsLoadingPortals(true)
      const response = await fetch("/api/portals", { cache: "no-store" })
      const data = await response.json().catch(() => ({ portals: [] }))
      const portals = Array.isArray(data.portals)
        ? (data.portals as SavedPortalRecord[])
        : []

      if (isMounted) {
        setSavedPortals(portals)
        setIsLoadingPortals(false)
      }

      const lastOpenedPortalId = localStorage.getItem(lastOpenedPortalStorageKey)
      const lastOpenedPortal = portals.find(
        (portal) => String(portal.id) === lastOpenedPortalId
      )

      if (!isMounted || !lastOpenedPortal) {
        return
      }

      setLoadingPortalId(lastOpenedPortal.id)
      setForm((current) => ({
        ...current,
        portalUrl: lastOpenedPortal.portalUrl,
        mac: lastOpenedPortal.mac,
        serial: lastOpenedPortal.serial ?? "",
        deviceId: lastOpenedPortal.deviceId ?? "",
        deviceId2: lastOpenedPortal.deviceId2 ?? "",
        signature: lastOpenedPortal.signature ?? "",
        timezone: lastOpenedPortal.timezone,
        stbType: lastOpenedPortal.stbType,
        query: "",
      }))
      setError("")
      setDetails([])

      const portalResponse = await fetch(`/api/portals/${lastOpenedPortal.id}`, {
        cache: "no-store",
      })
      const portalData = await portalResponse.json().catch(() => ({}))

      if (!isMounted) {
        return
      }

      setLoadingPortalId(null)

      if (!portalResponse.ok) {
        localStorage.removeItem(lastOpenedPortalStorageKey)
        setActivePortalId(null)
        setError(portalData.error || "Could not load the last opened portal.")
        return
      }

      setResult({
        endpoint: lastOpenedPortal.endpoint || "",
        profile: {},
        genres: uniqueGenres(portalData.channels ?? []),
        channels: Array.isArray(portalData.channels) ? portalData.channels : [],
      })
      setActivePortalId(lastOpenedPortal.id)
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

  async function loadSavedPortal(portal: SavedPortalRecord) {
    setLoadingPortalId(portal.id)
    setForm((current) => ({
      ...current,
      portalUrl: portal.portalUrl,
      mac: portal.mac,
      serial: portal.serial ?? "",
      deviceId: portal.deviceId ?? "",
      deviceId2: portal.deviceId2 ?? "",
      signature: portal.signature ?? "",
      timezone: portal.timezone,
      stbType: portal.stbType,
      query: "",
    }))
    setError("")
    setDetails([])

    const response = await fetch(`/api/portals/${portal.id}`, {
      cache: "no-store",
    })
    const data = await response.json().catch(() => ({}))
    setLoadingPortalId(null)

    if (!response.ok) {
      setResult(null)
      setError(data.error || "Could not load this saved portal.")
      return
    }

    setResult({
      endpoint: portal.endpoint || "",
      profile: {},
      genres: uniqueGenres(data.channels ?? []),
      channels: Array.isArray(data.channels) ? data.channels : [],
    })
    setActivePortalId(portal.id)
    localStorage.setItem(lastOpenedPortalStorageKey, String(portal.id))
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
        setForm((current) => ({
          ...current,
          portalUrl: refreshedPortal.portalUrl,
          mac: refreshedPortal.mac,
          serial: refreshedPortal.serial ?? "",
          deviceId: refreshedPortal.deviceId ?? "",
          deviceId2: refreshedPortal.deviceId2 ?? "",
          signature: refreshedPortal.signature ?? "",
          timezone: refreshedPortal.timezone,
          stbType: refreshedPortal.stbType,
          query: "",
        }))
        setResult(data.result)
        setActivePortalId(refreshedPortal.id)
        localStorage.setItem(lastOpenedPortalStorageKey, String(refreshedPortal.id))
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
      setActivePortalId(data.portal.id)
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
                          setResult(testResult)
                          setActivePortalId(null)
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

        {!result ? (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-background/85 p-1 backdrop-blur">
            <SettingsDialog
              logoSource={logoSource}
              onLogoSourceChange={handleLogoSourceChange}
              epgManifest={epgManifest}
              onRefetchComplete={handleEpgRefetchComplete}
              savedPortals={savedPortals}
              activePortalId={activePortalId}
              isLoadingPortals={isLoadingPortals}
              loadingPortalId={loadingPortalId}
              refetchingPortalId={refetchingPortalId}
              onAddPortal={() => setSheetOpen(true)}
              onLoadPortal={loadSavedPortal}
              onRefetchPortal={refetchSavedPortal}
            />
            <ThemeSelector />
          </div>
        ) : null}

        {loadingPortalId !== null || isLoadingPortals ? (
          <LoadingShell />
        ) : result ? (
          <ChannelBrowser
            channels={filteredChannels}
            endpoint={result.endpoint}
            portalRequest={portalRequest}
            logoSource={logoSource}
            epgChannels={epgChannels}
            query={form.query}
            onQueryChange={(value) => updateField("query", value)}
            utilityControls={
              <>
                <SettingsDialog
                  logoSource={logoSource}
                  onLogoSourceChange={handleLogoSourceChange}
                  epgManifest={epgManifest}
                  onRefetchComplete={handleEpgRefetchComplete}
                  savedPortals={savedPortals}
                  activePortalId={activePortalId}
                  isLoadingPortals={isLoadingPortals}
                  loadingPortalId={loadingPortalId}
                  refetchingPortalId={refetchingPortalId}
                  onAddPortal={() => setSheetOpen(true)}
                  onLoadPortal={loadSavedPortal}
                  onRefetchPortal={refetchSavedPortal}
                />
                <ThemeSelector />
              </>
            }
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <TvIcon className="text-muted-foreground" />
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
  channels: PortalChannel[]
  endpoint: string
  portalRequest: PortalRequest
  logoSource: "provider" | "epg"
  epgChannels: Record<string, { name: string; logoUrl?: string }>
  query: string
  onQueryChange: (value: string) => void
  utilityControls: ReactNode
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [copiedChannel, setCopiedChannel] = useState("")
  const [resolvingChannel, setResolvingChannel] = useState("")
  const [failedChannel, setFailedChannel] = useState("")
  const [selectedChannel, setSelectedChannel] = useState<PortalChannel | null>(
    null
  )
  const [playerStream, setPlayerStream] = useState<{
    channelKey: string
    channelName: string
    genre: string
    logoUrl: string
    number: string
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

  async function pullChannelStream(
    channel: PortalChannel,
    action: "copy" | "open" | "play" = "play"
  ) {
    const channelKey = getChannelKey(channel)

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
          ...portalRequest,
          endpoint,
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
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-background/85 p-1 backdrop-blur">
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
        className="h-full overflow-hidden rounded-none border-0"
        resizeTargetMinimumSize={{ coarse: 44, fine: 12 }}
      >
      <ResizablePanel defaultSize="360px" minSize="320px" maxSize="520px">
        <div className="flex h-full min-w-80 flex-col border-r bg-muted/20">
          <div className="flex flex-col gap-3 border-b p-4">
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
        className="min-h-0 flex-1"
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

            return (
              <button
                key={`${channel.id}-${channel.number}-${virtualRow.index}`}
                type="button"
                disabled={!canResolve || Boolean(resolvingChannel)}
                className={cn(
                  "absolute left-0 flex w-full items-center gap-3 border-b px-3 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
                  isSelected && "bg-accent"
                )}
                onClick={() => pullChannelStream(channel)}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border bg-zinc-950 p-1">
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
                  <span className="truncate text-xs text-muted-foreground">
                    {channel.genre || "Uncategorized"}
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
      <ResizableHandle withHandle />
      <ResizablePanel minSize="560px">
        <div className="flex h-full flex-col bg-background">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b px-4 py-3 pr-[28rem]">
            {playerStream ? (
              <div className="flex min-w-0 items-center gap-3">
                {playerStream.logoUrl ? (
                  <div className="flex size-10 items-center justify-center rounded-sm border bg-zinc-950 p-1.5">
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
                    {playerStream.number ? ` • #${playerStream.number}` : ""}
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
          <div className="flex flex-1 items-center justify-center p-4">
            {playerStream ? (
              <MediaPlayer
                key={`${playerStream.channelKey}-${playerStream.url}`}
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
                <MediaPlayerControls className="flex-col items-start gap-2.5 px-5 pb-4">
                  <MediaPlayerControlsOverlay />
                  <div className="flex w-full items-center gap-3 pb-1">
                    {playerStream.logoUrl ? (
                      <div className="flex size-10 items-center justify-center rounded-sm border border-white/20 bg-black/50 p-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Channel logos can come from arbitrary provider or EPG hosts. */}
                        <img
                          src={playerStream.logoUrl}
                          alt=""
                          className="size-full rounded object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : null}
                    <div className="flex min-w-0 flex-col gap-1">
                      <h2 className="truncate text-2xl font-semibold text-white">
                        {playerStream.channelName}
                      </h2>
                      <div className="flex min-w-0 items-center gap-2 text-sm text-white/60">
                        {playerStream.genre ? (
                          <span className="truncate font-medium">
                            {playerStream.genre}
                          </span>
                        ) : null}
                        {playerStream.genre && playerStream.number ? (
                          <span aria-hidden="true">•</span>
                        ) : null}
                        {playerStream.number ? (
                          <span className="font-mono">#{playerStream.number}</span>
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
            ) : (
              <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <TvIcon />
                <p className="text-sm">No channel selected.</p>
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>
      </ResizablePanelGroup>
    </>
  )
}

function canResolveChannel(channel: PortalChannel) {
  return Boolean(channel.id || channel.number || channel.name || channel.cmd)
}

function getChannelKey(channel: PortalChannel) {
  return channel.id || channel.number || channel.name
}

function getChannelLogoUrl(
  channel: PortalChannel,
  logoSource: "provider" | "epg",
  epgChannels: Record<string, { name: string; logoUrl?: string }>
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
      className="h-full overflow-hidden rounded-none border-0"
      resizeTargetMinimumSize={{ coarse: 44, fine: 12 }}
    >
      <ResizablePanel defaultSize="360px" minSize="320px" maxSize="520px">
        <div className="flex h-full min-w-80 flex-col border-r bg-muted/20">
          <div className="flex flex-col gap-3 border-b p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {Array.from({ length: 14 }).map((_, index) => (
              <div
                key={index}
                className="flex h-16 items-center gap-3 border-b px-3"
              >
                <Skeleton className="size-10 shrink-0 rounded-sm" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel minSize="560px">
        <div className="flex h-full flex-col bg-background">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b px-4 py-3 pr-[28rem]">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="size-10 rounded-sm" />
              <div className="flex min-w-0 flex-col gap-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <TvIcon />
              <p className="text-sm">No channel selected.</p>
            </div>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
