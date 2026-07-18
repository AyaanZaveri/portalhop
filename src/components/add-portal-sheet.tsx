"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CableIcon,
  ClipboardPasteIcon,
  Loader2Icon,
  SaveIcon,
  TvIcon,
  GlobeIcon,
  PlusIcon,
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
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { ShimmeringText } from "@/components/ui/shimmering-text"
import type { PortalRequest, PortalResponse } from "@/lib/stalker-types"
import type {
  SavedSourceRecord,
  SourceRequest,
  SourceType,
  EpgMode,
} from "@/lib/source-types"
import { useAiSettings } from "@/hooks/use-ai-settings"
import { useTheme } from "next-themes"
import { readTextFromClipboard } from "@/lib/clipboard"

type ConnectionFormState = PortalRequest & {
  sourceType: SourceType
  serverUrl: string
  username: string
  password: string
  outputFormat: string
  playlistUrl: string
  epgMode: EpgMode
  epgSourceId: number | null
}

type UserEpgSource = { id: number; name: string; url: string; channelCount: number; refreshedAt: string | null }

const initialConnectionForm: ConnectionFormState = {
  sourceType: "stalker",
  portalUrl: "",
  mac: "",
  serial: "",
  deviceId: "",
  deviceId2: "",
  signature: "",
  timezone: "America/Toronto",
  stbType: "MAG254",
  serverUrl: "",
  username: "",
  password: "",
  outputFormat: "m3u8",
  playlistUrl: "",
  epgMode: "portal",
  epgSourceId: null,
}

function formFromPortal(portal: SavedSourceRecord): ConnectionFormState {
  return {
    sourceType: portal.sourceType,
    portalUrl: portal.portalUrl ?? "",
    mac: portal.mac ?? "",
    serial: portal.serial ?? "",
    deviceId: portal.deviceId ?? "",
    deviceId2: portal.deviceId2 ?? "",
    signature: portal.signature ?? "",
    timezone: portal.timezone || "America/Toronto",
    stbType: portal.stbType || "MAG254",
    serverUrl: portal.serverUrl ?? "",
    username: portal.username ?? "",
    password: portal.password ?? "",
    outputFormat: portal.outputFormat || "m3u8",
    playlistUrl: portal.playlistUrl ?? "",
    epgMode: portal.epgMode,
    epgSourceId: portal.epgSourceId,
  }
}

function toSourceRequest(form: ConnectionFormState): SourceRequest {
  if (form.sourceType === "xtream") {
    return {
      sourceType: "xtream",
      serverUrl: form.serverUrl,
      username: form.username,
      password: form.password,
      outputFormat: form.outputFormat,
    }
  }

  if (form.sourceType === "m3u") {
    return {
      sourceType: "m3u",
      playlistUrl: form.playlistUrl,
    }
  }

  return {
    sourceType: "stalker",
    portalUrl: form.portalUrl,
    mac: form.mac,
    serial: form.serial,
    deviceId: form.deviceId,
    deviceId2: form.deviceId2,
    signature: form.signature,
    timezone: form.timezone,
    stbType: form.stbType,
  }
}

function renderEpgSelection(
  value: unknown,
  sources: UserEpgSource[],
  iptvEpgLogoUrl: string
) {
  const selected = typeof value === "string" ? value : "portal"
  if (selected === "iptv-org") {
    return <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iptvEpgLogoUrl} alt="" className="size-4 rounded-xs object-contain" />
      iptv-epg.org
    </>
  }
  if (selected.startsWith("custom:")) {
    const source = sources.find((item) => item.id === Number(selected.slice(7)))
    return <><TvIcon />{source?.name ?? "Custom EPG"}</>
  }
  if (selected === "none") return "None"
  return <><GlobeIcon />Portal&apos;s own EPG</>
}

export function AddPortalSheet({
  open,
  onOpenChange,
  onSaved,
  onView,
  editingPortal = null,
  onUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (
    portal: SavedSourceRecord,
    result: PortalResponse,
    request: SourceRequest
  ) => void
  onView?: (result: PortalResponse, request: SourceRequest) => void
  /** When set, the sheet edits this source in place instead of creating a new one. */
  editingPortal?: SavedSourceRecord | null
  onUpdated?: (
    portal: SavedSourceRecord,
    result: PortalResponse,
    request: SourceRequest
  ) => void
}) {
  const { resolvedTheme } = useTheme()
  const iptvEpgLogoUrl = resolvedTheme === "dark"
    ? "/epg/iptv-epg-dark.png"
    : "/epg/iptv-epg-light.png"
  const { settings: aiSettings, effectiveBaseUrl, effectiveApiKey } =
    useAiSettings()
  const formRef = useRef<HTMLFormElement>(null)
  const [form, setForm] = useState<ConnectionFormState>(initialConnectionForm)
  const [testResult, setTestResult] = useState<PortalResponse | null>(null)
  const [error, setError] = useState("")
  const [details, setDetails] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [portalName, setPortalName] = useState("")
  const [saveError, setSaveError] = useState("")
  const [isSavingPortal, setIsSavingPortal] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importText, setImportText] = useState("")
  const [isImportingPortal, setIsImportingPortal] = useState(false)
  const [epgSources, setEpgSources] = useState<UserEpgSource[]>([])
  const [newEpgOpen, setNewEpgOpen] = useState(false)
  const [newEpgName, setNewEpgName] = useState("")
  const [newEpgUrl, setNewEpgUrl] = useState("")
  const [isCreatingEpg, setIsCreatingEpg] = useState(false)

  // Seed the form from the source being edited each time the sheet opens, and
  // clear any previous test result so Save always reflects a fresh Test.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTestResult(null)
    setError("")
    setDetails([])
    setForm(editingPortal ? formFromPortal(editingPortal) : initialConnectionForm)
    fetch("/api/epg-sources").then((res) => res.ok ? res.json() : null).then((data) => setEpgSources(Array.isArray(data?.sources) ? data.sources : [])).catch(() => { })
  }, [open, editingPortal])

  const portalRequest = toSourceRequest(form)
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

  function updateField<K extends keyof ConnectionFormState>(
    key: K,
    value: ConnectionFormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
    setTestResult(null)
  }

  async function createEpgSource() {
    if (!newEpgName.trim() || !newEpgUrl.trim()) return
    setIsCreatingEpg(true)
    try {
      const res = await fetch("/api/epg-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newEpgName, url: newEpgUrl }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not add EPG source.")
      const source = data.source as UserEpgSource
      setEpgSources((items) => [source, ...items])
      updateField("epgMode", "custom")
      updateField("epgSourceId", source.id)
      setNewEpgName(""); setNewEpgUrl(""); setNewEpgOpen(false)
      toast.success(data.refreshError ? "EPG source saved; refresh failed." : "EPG source added.", { position: "top-center" })
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add EPG source.", { position: "top-center" }) } finally { setIsCreatingEpg(false) }
  }

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
          sourceType: form.sourceType,
          portalUrl: form.portalUrl,
          mac: form.mac,
          serial: form.serial,
          deviceId: form.deviceId,
          deviceId2: form.deviceId2,
          signature: form.signature,
          timezone: form.timezone,
          stbType: form.stbType,
          serverUrl: form.serverUrl,
          username: form.username,
          password: form.password,
          outputFormat: form.outputFormat,
          playlistUrl: form.playlistUrl,
        }),
      })

      const data = await response.json()
      setIsLoading(false)

      if (!response.ok) {
        const errMsg = data.error || "The portal request failed."
        setError(errMsg)
        setDetails(Array.isArray(data.details) ? data.details : [])
        toast.error(`Connection failed: ${errMsg}`, { position: "top-center" })
        return
      }

      setTestResult(data)
      const channelCount = Array.isArray(data.channels) ? data.channels.length : 0
      toast.success(
        `Connection test successful! Found ${channelCount.toLocaleString()} channel${channelCount === 1 ? "" : "s"}.`,
        { position: "top-center" }
      )
    } catch (err) {
      setIsLoading(false)
      const errMsg =
        err instanceof Error ? err.message : "An unexpected error occurred."
      setError(errMsg)
      toast.error(`Connection failed: ${errMsg}`, { position: "top-center" })
    }
  }

  async function importPortalText(overrideText?: string) {
    const text = (overrideText ?? importText).trim()

    if (!text) {
      toast.error("Paste portal text to import.", { position: "top-center" })
      return
    }

    setIsImportingPortal(true)

    try {
      const response = await fetch("/api/import-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          settings: {
            baseUrl: effectiveBaseUrl,
            apiKey: effectiveApiKey,
            model: aiSettings.model,
            reasoningEffort: aiSettings.reasoningEffort,
          },
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || "Could not import portal text.")
      }

      const portal = data.portal as
        | Partial<
          PortalRequest & {
            serverUrl: string
            username: string
            password: string
            playlistUrl: string
          }
        >
        | undefined
      const detectedType = data.sourceType as SourceType | null | undefined

      if (!portal) {
        throw new Error("No portal fields were found.")
      }

      setForm((current) => ({
        ...current,
        sourceType: detectedType || current.sourceType,
        portalUrl: portal.portalUrl || current.portalUrl,
        mac: portal.mac || current.mac,
        serial: portal.serial ?? current.serial,
        deviceId: portal.deviceId ?? current.deviceId,
        deviceId2: portal.deviceId2 ?? current.deviceId2,
        signature: portal.signature ?? current.signature,
        timezone: portal.timezone || current.timezone,
        stbType: portal.stbType || current.stbType,
        serverUrl: portal.serverUrl || current.serverUrl,
        username: portal.username || current.username,
        password: portal.password || current.password,
        playlistUrl: portal.playlistUrl || current.playlistUrl,
      }))
      setTestResult(null)
      setImportDialogOpen(false)
      setImportText("")
      toast.success(
        detectedType === "xtream"
          ? "Xtream connection fields imported."
          : detectedType === "stalker"
            ? "Stalker connection fields imported."
            : detectedType === "m3u"
              ? "M3U playlist link imported."
              : "Connection fields imported.",
        { position: "top-center" }
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not import portal text.",
        { position: "top-center" }
      )
    } finally {
      setIsImportingPortal(false)
    }
  }

  async function importFromClipboard() {
    let clipboardText: string

    try {
      clipboardText = await readTextFromClipboard()
    } catch {
      toast.error("Could not read the clipboard. Check your browser's clipboard permission.", { position: "top-center" })
      return
    }

    if (!clipboardText.trim()) {
      toast.error("Clipboard is empty.", { position: "top-center" })
      return
    }

    setImportText(clipboardText)
    await importPortalText(clipboardText)
  }

  function openSaveDialog() {
    if (!testResult) return
    setPortalName(editingPortal?.name || testResult.profile.login || "")
    setSaveError("")
    setSaveDialogOpen(true)
  }

  // Cmd/Ctrl+Shift+V imports the clipboard directly, skipping the manual
  // open-dialog-then-paste steps. Cmd/Ctrl+Enter activates whichever primary
  // action the footer is currently showing (Test, or Save once tested). Both
  // are only active while the sheet itself is open.
  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return

      if (event.key.toLowerCase() === "v" && event.shiftKey) {
        event.preventDefault()
        importFromClipboard()
        return
      }

      if (event.key === "Enter") {
        event.preventDefault()
        if (testResult) {
          openSaveDialog()
        } else if (!isLoading) {
          formRef.current?.requestSubmit()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, testResult, isLoading])

  async function saveCurrentPortal() {
    if (!testResult) {
      return
    }

    const name = portalName.trim()

    if (!name) {
      setSaveError("Add a nickname first.")
      return
    }

    setIsSavingPortal(true)
    setSaveError("")

    const response = await fetch(
      editingPortal ? `/api/portals/${editingPortal.id}` : "/api/portals",
      {
        method: editingPortal ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...portalRequest,
          epgMode: form.epgMode,
          epgSourceId: form.epgMode === "custom" ? form.epgSourceId : null,
          name,
          endpoint: testResult.endpoint,
        }),
      }
    )
    const data = await response.json().catch(() => ({}))
    setIsSavingPortal(false)

    if (!response.ok) {
      setSaveError(
        data.error ||
        (editingPortal
          ? "Could not update this source."
          : "Could not save this portal.")
      )
      return
    }

    if (data.portal) {
      const portal = data.portal as SavedSourceRecord
      if (editingPortal) {
        ; (onUpdated ?? onSaved)(portal, testResult, portalRequest)
      } else {
        onSaved(portal, testResult, portalRequest)
      }
    }

    setPortalName("")
    setSaveDialogOpen(false)
    setForm(initialConnectionForm)
    setTestResult(null)
    onOpenChange(false)
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen)
          if (!nextOpen) {
            setTestResult(null)
          }
        }}
      >
        <SheetContent className="gap-0 backdrop-blur-md sm:max-w-xl! dark:bg-background/50">
          <SheetHeader className="pb-2">
            <div className="flex min-w-0 flex-col gap-0.5 pr-8">
              <SheetTitle className="flex items-center gap-1.5">
                <CableIcon className="size-4 text-primary brightness-75 dark:brightness-100" />
                {editingPortal ? "Edit connection" : "Connection"}
              </SheetTitle>
            </div>
          </SheetHeader>

          <form ref={formRef} onSubmit={onSubmit} className="flex flex-col flex-1 gap-0 overflow-hidden">
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-4 pt-2 pb-4">
                <FieldGroup>
                  <div className="grid gap-4">
                    <div className="flex items-center gap-2">
                      <Tabs
                        value={form.sourceType}
                        onValueChange={(value) =>
                          updateField("sourceType", value as SourceType)
                        }
                        className="min-w-0 flex-1"
                      >
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="stalker">Stalker</TabsTrigger>
                          <TabsTrigger value="xtream">Xtream</TabsTrigger>
                          <TabsTrigger value="m3u">M3U</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              className="shrink-0"
                              disabled={isImportingPortal}
                              onClick={() => setImportDialogOpen(true)}
                            >
                              {isImportingPortal ? (
                                <>
                                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                                  <ShimmeringText text="Importing" />
                                </>
                              ) : (
                                <>
                                  <ClipboardPasteIcon data-icon="inline-start" />
                                  Import text
                                </>
                              )}
                            </Button>
                          }
                        />
                        <TooltipContent align="center" className="px-1.5!">
                          <KbdGroup>
                            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                            <span>+</span>
                            <Kbd>Shift</Kbd>
                            <span>+</span>
                            <Kbd>V</Kbd>
                          </KbdGroup>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {form.sourceType === "stalker" ? (
                      <>
                        <Field>
                          <FieldLabel htmlFor="portalUrl">Portal URL</FieldLabel>
                          <InputGroup>
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
                            <InputGroupAddon align="inline-start">URL</InputGroupAddon>
                          </InputGroup>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="mac">MAC address</FieldLabel>
                          <InputGroup>
                            <InputGroupInput
                              id="mac"
                              required
                              placeholder="00:1A:79:00:00:00"
                              value={form.mac}
                              onChange={(event) => updateField("mac", event.target.value)}
                            />
                            <InputGroupAddon align="inline-start">MAC</InputGroupAddon>
                          </InputGroup>
                        </Field>

                        <Accordion className="w-full">
                          <AccordionItem value="advanced" className="border-none -mx-1">
                            <AccordionTrigger className="hover:no-underline text-xs text-muted-foreground px-1 py-1">
                              Show advanced
                            </AccordionTrigger>
                            <AccordionContent className="px-1 pt-2">
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
                      </>
                    ) : null}

                    {form.sourceType === "xtream" ? (
                      <>
                        <SimpleInput
                          id="serverUrl"
                          label="Server URL"
                          placeholder="http://example.com:8080"
                          value={form.serverUrl}
                          onChange={(value) => updateField("serverUrl", value)}
                        />
                        <SimpleInput
                          id="username"
                          label="Username"
                          placeholder="Username"
                          value={form.username}
                          onChange={(value) => updateField("username", value)}
                        />
                        <SimpleInput
                          id="password"
                          label="Password"
                          placeholder="Password"
                          value={form.password}
                          onChange={(value) => updateField("password", value)}
                        />
                        <Field>
                          <FieldLabel htmlFor="outputFormat">
                            Output format
                          </FieldLabel>
                          <Tabs
                            value={form.outputFormat}
                            onValueChange={(value) =>
                              updateField("outputFormat", value)
                            }
                          >
                            <TabsList id="outputFormat" className="grid w-full grid-cols-2">
                              <TabsTrigger value="m3u8" className="font-mono">m3u8</TabsTrigger>
                              <TabsTrigger value="ts" className="font-mono">ts</TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </Field>
                      </>
                    ) : null}

                    {form.sourceType === "m3u" ? (
                      <SimpleInput
                        id="playlistUrl"
                        label="M3U playlist URL"
                        placeholder="http://example.com/get.php?username=..."
                        value={form.playlistUrl}
                        onChange={(value) => updateField("playlistUrl", value)}
                      />
                    ) : null}

                    <Field>
                      <FieldLabel htmlFor="epg-source">EPG</FieldLabel>
                      <Select
                        value={form.epgMode === "custom" && form.epgSourceId ? `custom:${form.epgSourceId}` : form.epgMode}
                        onValueChange={(value) => {
                          if (!value) return
                          if (value === "create") { setNewEpgOpen(true); return }
                          if (value.startsWith("custom:")) { updateField("epgMode", "custom"); updateField("epgSourceId", Number(value.slice(7))) }
                          else { updateField("epgMode", value as EpgMode); updateField("epgSourceId", null) }
                        }}
                      >
                        <SelectTrigger id="epg-source" className="w-full">
                          <SelectValue>
                            {(value) => renderEpgSelection(value, epgSources, iptvEpgLogoUrl)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent side="bottom" align="start" alignItemWithTrigger={false}>
                          <SelectGroup><SelectLabel>Guide & logos</SelectLabel>
                            <SelectItem value="portal"><GlobeIcon />Portal&apos;s own EPG</SelectItem>
                            <SelectItem value="iptv-org">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={iptvEpgLogoUrl} alt="" className="size-4 rounded-xs object-contain" />
                              iptv-epg.org
                            </SelectItem>
                          </SelectGroup>
                          {epgSources.length ? <><SelectSeparator /><SelectGroup><SelectLabel>Your EPG sources</SelectLabel>{epgSources.map((source) => <SelectItem key={source.id} value={`custom:${source.id}`}><TvIcon className="-mt-0.5" />{source.name}</SelectItem>)}</SelectGroup></> : null}
                          <SelectSeparator />
                          <SelectGroup><SelectItem value="none">None</SelectItem><SelectItem value="create"><PlusIcon />Create new EPG source…</SelectItem></SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>Choose the programme guide and channel-logo source for this portal.</FieldDescription>
                    </Field>
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
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          onClick={openSaveDialog}
                        >
                          <SaveIcon data-icon="inline-start" />
                          Save
                        </Button>
                      }
                    />
                    <TooltipContent align="center" className="px-1.5!">
                      <KbdGroup>
                        <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                        <span>+</span>
                        <Kbd>Enter</Kbd>
                      </KbdGroup>
                    </TooltipContent>
                  </Tooltip>
                  {onView ? (
                    <Button
                      type="button"
                      onClick={() => {
                        onView(testResult, portalRequest)
                        onOpenChange(false)
                      }}
                      className="cursor-pointer"
                    >
                      <ArrowRightIcon data-icon="inline-start" />
                      View
                    </Button>
                  ) : null}
                </>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button type="submit" disabled={isLoading} className="cursor-pointer">
                        {isLoading ? (
                          <Loader2Icon data-icon="inline-start" className="animate-spin" />
                        ) : (
                          <ArrowRightIcon data-icon="inline-start" />
                        )}
                        Test
                      </Button>
                    }
                  />
                  <TooltipContent align="center" className="px-1.5!">
                    <KbdGroup>
                      <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                      <span>+</span>
                      <Kbd>Enter</Kbd>
                    </KbdGroup>
                  </TooltipContent>
                </Tooltip>
              )}
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <Dialog open={newEpgOpen} onOpenChange={setNewEpgOpen}>
        <DialogContent><DialogHeader><DialogTitle>Add EPG source</DialogTitle><DialogDescription>Add a reusable XMLTV URL for this and other portals.</DialogDescription></DialogHeader>
          <div className="grid gap-4"><SimpleInput id="newEpgName" label="Name" placeholder="My provider EPG" value={newEpgName} onChange={setNewEpgName} /><SimpleInput id="newEpgUrl" label="XMLTV URL" placeholder="https://example.com/guide.xml.gz" value={newEpgUrl} onChange={setNewEpgUrl} /></div>
          <DialogFooter><Button type="button" onClick={createEpgSource} disabled={isCreatingEpg}>{isCreatingEpg ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}{isCreatingEpg ? "Saving…" : "Save EPG source"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {editingPortal ? "Save changes" : "Save source"}
              </DialogTitle>
              <DialogDescription>
                {editingPortal
                  ? "Confirm the nickname for this source."
                  : "Add a nickname for this source so you can load it later."}
              </DialogDescription>
            </DialogHeader>

            <Field data-invalid={Boolean(saveError)}>
              <FieldLabel htmlFor="portalName">Nickname</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="portalName"
                  placeholder="Living room IPTV"
                  value={portalName}
                  aria-invalid={Boolean(saveError)}
                  onChange={(event) => setPortalName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      saveCurrentPortal()
                    }
                  }}
                />
                <InputGroupAddon align="inline-start">
                  <TvIcon />
                </InputGroupAddon>
              </InputGroup>
              {saveError ? <FieldDescription>{saveError}</FieldDescription> : null}
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
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="overflow-hidden sm:max-w-lg">
          <div className="flex min-w-0 flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Import connection text</DialogTitle>
              <DialogDescription>
                Paste a Stalker portal dump, an Xtream link/credentials, or an M3U playlist link and Portal Hop will fill the connection fields and switch to the right tab automatically.
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="h-80 min-w-0 rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
              <Textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="Paste portal/MAC text, an Xtream URL/username/password, or an M3U playlist link..."
                wrap="soft"
                className="min-h-full min-w-0 resize-none overflow-hidden break-all whitespace-pre-wrap border-0 bg-transparent shadow-none ring-0 field-sizing-content focus-visible:ring-0 dark:bg-transparent [overflow-wrap:anywhere]"
              />
            </ScrollArea>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isImportingPortal || !importText.trim()}
                onClick={() => importPortalText()}
              >
                {isImportingPortal ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <ClipboardPasteIcon data-icon="inline-start" />
                )}
                Import
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
