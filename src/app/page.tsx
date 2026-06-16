"use client"

import {
  FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  RefreshCwIcon,
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
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type { PortalChannel, PortalRequest, PortalResponse } from "@/lib/stalker-types"

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
    setResult(null)

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
      setError(data.error || "The portal request failed.")
      setDetails(Array.isArray(data.details) ? data.details : [])
      return
    }

    setResult(data)
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
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

    const response = await fetch(`/api/portals/${portal.id}/refetch`, {
      method: "POST",
    })
    const data = await response.json().catch(() => ({}))
    setRefetchingPortalId(null)

    if (!response.ok) {
      setError(data.error || "Could not refetch this saved portal.")
      setDetails(Array.isArray(data.details) ? data.details : [])
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
  }

  async function saveCurrentPortal() {
    if (!result) {
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
        endpoint: result.endpoint,
        channelCount: result.channels.length,
        channels: result.channels,
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
              Portal Hop
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Enter an authorized portal and device identity to read the channel
              catalog through the MAG/Stalker handshake flow.
            </p>
          </div>
          <Badge variant={result ? "secondary" : "outline"}>
            {result ? `${result.channels.length} channels` : "Idle"}
          </Badge>
        </header>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">Saved portals</h2>
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
                  className="flex shrink-0 items-stretch overflow-hidden rounded-lg border"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto flex-col items-start gap-1 rounded-none px-3 py-2"
                    onClick={() => loadSavedPortal(portal)}
                  >
                    <span className="font-medium">{portal.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {portal.channelCount} channels
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-none border-l px-2"
                    disabled={
                      loadingPortalId === portal.id ||
                      refetchingPortalId === portal.id
                    }
                    onClick={() => refetchSavedPortal(portal)}
                  >
                    {refetchingPortalId === portal.id ? (
                      <Loader2Icon
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : (
                      <RefreshCwIcon data-icon="inline-start" />
                    )}
                    Refetch
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

        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <section className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-medium">Connection</h2>
                <p className="text-sm text-muted-foreground">
                The app tests common `portal.php` and
                `stalker_portal/server/load.php` endpoints automatically.
                </p>
              </div>
              <div className="flex gap-2">
                {result ? (
                  <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isLoading}
                      onClick={() => {
                        setPortalName(result.profile.login || "")
                        setSaveError("")
                        setSaveDialogOpen(true)
                      }}
                    >
                      <SaveIcon data-icon="inline-start" />
                      Save
                    </Button>
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
                ) : null}

                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2Icon data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <ArrowRightIcon data-icon="inline-start" />
                  )}
                  Go
                </Button>
              </div>
            </div>

            <FieldGroup>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
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
                  <FieldDescription>
                    Paste the URL you would normally enter in a MAG/STB app.
                  </FieldDescription>
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
                  <FieldDescription>
                    `001A79...` is accepted and normalized.
                  </FieldDescription>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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
            </FieldGroup>
          </section>
        </form>

        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Connection failed</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col gap-2">
                <p>{error}</p>
                {details.length ? (
                  <details className="text-xs">
                    <summary>Endpoint attempts</summary>
                    <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
                      {details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        <Separator />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-medium">Channels</h2>
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
                <RefreshCwIcon data-icon="inline-start" />
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

          {isLoading ? (
            <LoadingRows />
          ) : result ? (
            <ChannelTable
              channels={filteredChannels}
              endpoint={result.endpoint}
              portalRequest={portalRequest}
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
}: {
  channels: PortalChannel[]
  endpoint: string
  portalRequest: PortalRequest
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

  async function copyChannelLink(channel: PortalChannel) {
    const channelKey = getChannelKey(channel)
    const fallback = getChannelLink(channel)

    if (!fallback) {
      return
    }

    setResolvingChannel(channelKey)
    setFailedChannel("")

    const response = await fetch("/api/channel-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...portalRequest,
        endpoint,
        cmd: channel.cmd,
      }),
    })
    const data = await response.json().catch(() => ({}))
    const link = response.ok && typeof data.link === "string" ? data.link : fallback

    if (!response.ok && isInternalPortalCommand(link)) {
      setResolvingChannel("")
      setFailedChannel(channelKey)
      window.setTimeout(() => setFailedChannel(""), 1800)
      return
    }

    await navigator.clipboard.writeText(link)
    setResolvingChannel("")
    setCopiedChannel(channelKey)
    window.setTimeout(() => setCopiedChannel(""), 1400)
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
      <div className="min-w-[980px]">
        <div
          className="sticky top-0 z-10 grid h-10 grid-cols-[72px_minmax(280px,2fr)_160px_80px_minmax(240px,1fr)_112px] items-center border-b bg-background px-2 text-sm font-medium text-foreground"
          role="row"
        >
          <div role="columnheader">No.</div>
          <div role="columnheader">Name</div>
          <div role="columnheader">Genre</div>
          <div role="columnheader">ID</div>
          <div role="columnheader">Command</div>
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
            const link = getChannelLink(channel)
            const isCopied = copiedChannel === channelKey
            const isResolving = resolvingChannel === channelKey
            const didFail = failedChannel === channelKey

            return (
              <div
                key={`${channel.id}-${channel.number}-${virtualRow.index}`}
                className="absolute left-0 grid w-full grid-cols-[72px_minmax(280px,2fr)_160px_80px_minmax(240px,1fr)_112px] items-center border-b px-2 text-sm"
                role="row"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="font-medium" role="cell">
                  {channel.number || virtualRow.index + 1}
                </div>
                <div role="cell">
                  <div className="flex min-w-0 items-center gap-3">
                    {channel.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Portal logos can come from arbitrary hosts.
                      <img
                        src={channel.logoUrl}
                        alt=""
                        className="size-10 rounded-md border bg-muted object-contain p-1"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.style.display = "none"
                        }}
                      />
                    ) : null}
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
                <div className="truncate text-muted-foreground" role="cell">
                  {channel.id || "-"}
                </div>
                <div className="truncate text-muted-foreground" role="cell">
                  {channel.cmd || "-"}
                </div>
                <div className="text-right" role="cell">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!link || Boolean(resolvingChannel)}
                    onClick={() => copyChannelLink(channel)}
                  >
                    {isResolving ? (
                      <Loader2Icon
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : isCopied ? (
                      <CheckIcon data-icon="inline-start" />
                    ) : (
                      <CopyIcon data-icon="inline-start" />
                    )}
                    {isResolving
                      ? "Resolving"
                      : isCopied
                        ? "Copied"
                        : didFail
                          ? "Failed"
                          : "Copy"}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}

function getChannelLink(channel: PortalChannel) {
  return channel.cmd.replace(/^(ffmpeg|ffrt)\s+/i, "").trim()
}

function isInternalPortalCommand(link: string) {
  try {
    const url = new URL(link)
    return url.hostname === "localhost" && url.pathname.startsWith("/ch/")
  } catch {
    return false
  }
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
