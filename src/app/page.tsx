"use client"

import {
  FormEvent,
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
  ChevronDownIcon,
  CopyIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  Rabbit,
  SaveIcon,
  SearchIcon,
  TvIcon,
  BrushCleaning,
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
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import type { PortalChannel, PortalRequest, PortalResponse } from "@/lib/stalker-types"
import { SettingsDialog } from "@/components/settings-dialog"
import type { EpgManifest } from "@/lib/epg-store"
import { ThemeSelector } from "@/components/theme-selector"

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

      if (isMounted) {
        setSavedPortals(Array.isArray(data.portals) ? data.portals : [])
        setIsLoadingPortals(false)
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
    }

    setPortalName("")
    setSaveDialogOpen(false)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-7 px-4 py-8 sm:px-6 lg:px-8">
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <Sheet
            open={sheetOpen}
            onOpenChange={(open) => {
              setSheetOpen(open)
              if (!open) {
                setTestResult(null)
              }
            }}
          >
            <SheetTrigger render={
              <Button variant="default" className="cursor-pointer">
                <PlusIcon data-icon="inline-start" />
                Add Portal
              </Button>
            } />
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

                <SheetFooter className="border-t pt-4">
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

          <SettingsDialog
            logoSource={logoSource}
            onLogoSourceChange={handleLogoSourceChange}
            epgManifest={epgManifest}
            onRefetchComplete={handleEpgRefetchComplete}
          />
          <ThemeSelector />
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            Portal Hop
            <Rabbit className="size-7 shrink-0 translate-y-px text-primary" />
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Enter an authorized portal and device identity to read the channel
            catalog through the MAG/Stalker handshake flow.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Portals</h2>
            {isLoadingPortals ? (
              <Badge variant="outline">Loading</Badge>
            ) : (
              <Badge variant="outline">{savedPortals.length} saved</Badge>
            )}
          </div>

          {savedPortals.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {savedPortals.map((portal) => (
                <div
                  key={portal.id}
                  className="group relative flex shrink-0"
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="peer h-auto w-60 flex flex-row items-center gap-4 rounded-xl px-3 py-3 pr-11 text-left cursor-pointer"
                    onClick={() => loadSavedPortal(portal)}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/50 border border-muted/20 text-foreground">
                      <TvIcon className="size-5" />
                    </div>
                    <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                      <span className="font-semibold text-base w-full truncate">{portal.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {portal.channelCount.toLocaleString()} channels
                      </span>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2.5 right-2.5 size-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer z-10 transition-transform duration-75 group-active:translate-y-px"
                    disabled={
                      loadingPortalId === portal.id ||
                      refetchingPortalId === portal.id
                    }
                    onClick={() => refetchSavedPortal(portal)}
                    aria-label="Refetch portal"
                  >
                    {refetchingPortalId === portal.id ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCwIcon className="size-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isLoadingPortals
                ? "Loading saved portals."
                : "Successful connections can be saved here."}
            </p>
          )}
        </section>



        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">Channels</h2>
              <p className="text-sm text-muted-foreground">
                {result
                  ? `Connected through ${result.endpoint}`
                  : "Run a portal request to load the channel list."}
              </p>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={!result || isLoading}
                onClick={() => {
                  setForm((current) => ({ ...current, query: "" }))
                  setResult(null)
                }}
              >
                <BrushCleaning data-icon="inline-start" />
                Clear
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <InputGroup className="max-w-md">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Filter by name, number, genre, or cmd"
                value={form.query}
                onChange={(event) => updateField("query", event.target.value)}
                disabled={!result}
              />
            </InputGroup>
            {result ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{result.genres.length} genres</Badge>
                <Badge variant="outline">{filteredChannels.length} visible</Badge>
              </div>
            ) : null}
          </div>

          {loadingPortalId !== null ? (
            <LoadingRows />
          ) : result ? (
            <ChannelTable
              channels={filteredChannels}
              endpoint={result.endpoint}
              portalRequest={portalRequest}
              logoSource={logoSource}
              epgChannels={epgChannels}
            />
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center">
              <TvIcon className="text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <p className="font-medium">No channels loaded</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Add the portal details above and press Go.
                </p>
              </div>
            </div>
          )}
        </section>
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

function ChannelTable({
  channels,
  endpoint,
  portalRequest,
  logoSource,
  epgChannels,
}: {
  channels: PortalChannel[]
  endpoint: string
  portalRequest: PortalRequest
  logoSource: "provider" | "epg"
  epgChannels: Record<string, { name: string; logoUrl?: string }>
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [copiedChannel, setCopiedChannel] = useState("")
  const [resolvingChannel, setResolvingChannel] = useState("")
  const [failedChannel, setFailedChannel] = useState("")
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
    action: "copy" | "open"
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
      } else {
        window.location.href = `iina://weblink?url=${encodeURIComponent(
          data.link
        )}`
        toast.dismiss(toastId)
        toast.success("Opening in IINA", {
          description: channel.name,
          icon: <CheckIcon className="size-4 text-foreground" />,
        })
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

  if (!channels.length) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No channels matched the current filter.
      </div>
    )
  }

  return (
    <ScrollArea
      ref={scrollAreaRef}
      className="h-[70vh] rounded-lg border"
      role="table"
      aria-rowcount={channels.length}
    >
      <div className="min-w-[800px]">
        <div
          className="sticky top-0 z-10 grid h-10 grid-cols-[72px_minmax(200px,1fr)_180px_180px_112px] items-center border-b bg-background px-4 text-sm font-medium text-foreground"
          role="row"
        >
          <div role="columnheader">No.</div>
          <div role="columnheader">Name</div>
          <div role="columnheader">Genre</div>
          <div role="columnheader">ID</div>
          <div className="text-right" role="columnheader">
            Link
          </div>
        </div>

        <div
          className="relative"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          role="rowgroup"
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const channel = channels[virtualRow.index]
            const channelKey = getChannelKey(channel)
            const canResolve = canResolveChannel(channel)
            const isCopied = copiedChannel === channelKey
            const isResolving = resolvingChannel === channelKey
            const didFail = failedChannel === channelKey

            return (
              <div
                key={`${channel.id}-${channel.number}-${virtualRow.index}`}
                className="absolute left-0 grid w-full grid-cols-[72px_minmax(200px,1fr)_180px_180px_112px] items-center border-b px-4 text-sm"
                role="row"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="font-mono font-medium" role="cell">
                  {channel.number || virtualRow.index + 1}
                </div>
                <div role="cell">
                  <div className="flex min-w-0 items-center gap-3">
                    {(() => {
                      const lookupId = channel.xmltvId || channel.id;
                      const logoUrl = (logoSource === "epg" && lookupId ? epgChannels[lookupId.toLowerCase()]?.logoUrl : null) || channel.logoUrl;
                      if (!logoUrl) return null;
                      return (
                        // eslint-disable-next-line @next/next/no-img-element -- Portal/EPG logos can come from arbitrary hosts.
                        <img
                          src={logoUrl}
                          alt=""
                          className="h-9 w-9 rounded-sm border bg-zinc-950 p-1 object-contain"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(event) => {
                            event.currentTarget.style.display = "none"
                          }}
                        />
                      );
                    })()}
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-medium">{channel.name}</span>
                      {channel.logo ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {channel.logo}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div role="cell">
                  {channel.genre ? (
                    <Badge variant="outline">{channel.genre}</Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>
                <div className="truncate font-mono text-muted-foreground" role="cell">
                  {channel.xmltvId || channel.id || "-"}
                </div>

                <div className="text-right" role="cell">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!canResolve}
                        />
                      }
                    >
                      Actions
                      <ChevronDownIcon className="size-4 opacity-50" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        disabled={Boolean(resolvingChannel)}
                        onClick={() => pullChannelStream(channel, "open")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- IINA icon is a local public asset */}
                        <img src="/iina.png" alt="" className="size-4 scale-125 object-contain" />
                        Open in IINA
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={Boolean(resolvingChannel)}
                        onClick={() => pullChannelStream(channel, "copy")}
                      >
                        {isResolving ? (
                          <Spinner />
                        ) : isCopied ? (
                          <CheckIcon className="size-4" />
                        ) : didFail ? (
                          <AlertCircleIcon className="size-4 text-destructive" />
                        ) : (
                          <CopyIcon className="size-4" />
                        )}
                        {isResolving
                          ? "Resolving..."
                          : isCopied
                            ? "Copied"
                            : didFail
                              ? "Failed"
                              : "Copy stream"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}

function canResolveChannel(channel: PortalChannel) {
  return Boolean(channel.id || channel.number || channel.name || channel.cmd)
}

function getChannelKey(channel: PortalChannel) {
  return channel.id || channel.number || channel.name
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

function LoadingRows() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="grid grid-cols-[64px_1fr_120px] gap-3" key={index}>
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ))}
    </div>
  )
}
