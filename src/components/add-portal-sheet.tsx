"use client"

import { FormEvent, useState } from "react"
import { toast } from "sonner"
import {
  AlertCircleIcon,
  ArrowRightIcon,
  ClipboardPasteIcon,
  Loader2Icon,
  SaveIcon,
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
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { PortalRequest, PortalResponse } from "@/lib/stalker-types"
import type {
  SavedSourceRecord,
  SourceRequest,
  SourceType,
} from "@/lib/source-types"
import { useAiSettings } from "@/hooks/use-ai-settings"

type ConnectionFormState = PortalRequest & {
  sourceType: SourceType
  serverUrl: string
  username: string
  password: string
  outputFormat: string
  playlistUrl: string
}

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

export function AddPortalSheet({
  open,
  onOpenChange,
  onSaved,
  onView,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (
    portal: SavedSourceRecord,
    result: PortalResponse,
    request: SourceRequest
  ) => void
  onView?: (result: PortalResponse, request: SourceRequest) => void
}) {
  const { settings: aiSettings, effectiveBaseUrl, effectiveApiKey } =
    useAiSettings()
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

  const portalRequest = toSourceRequest(form)

  function updateField<K extends keyof ConnectionFormState>(
    key: K,
    value: ConnectionFormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
    setTestResult(null)
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
        toast.error(`Connection failed: ${errMsg}`)
        return
      }

      setTestResult(data)
      toast.success("Connection test successful!")
    } catch (err) {
      setIsLoading(false)
      const errMsg =
        err instanceof Error ? err.message : "An unexpected error occurred."
      setError(errMsg)
      toast.error(`Connection failed: ${errMsg}`)
    }
  }

  async function importPortalText() {
    const text = importText.trim()

    if (!text) {
      toast.error("Paste portal text to import.")
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

      const portal = data.portal as Partial<PortalRequest> | undefined

      if (!portal) {
        throw new Error("No portal fields were found.")
      }

      setForm((current) => ({
        ...current,
        portalUrl: portal.portalUrl || current.portalUrl,
        mac: portal.mac || current.mac,
        serial: portal.serial ?? current.serial,
        deviceId: portal.deviceId ?? current.deviceId,
        deviceId2: portal.deviceId2 ?? current.deviceId2,
        signature: portal.signature ?? current.signature,
        timezone: portal.timezone || current.timezone,
        stbType: portal.stbType || current.stbType,
      }))
      setTestResult(null)
      setImportDialogOpen(false)
      setImportText("")
      toast.success("Portal fields imported.")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not import portal text."
      )
    } finally {
      setIsImportingPortal(false)
    }
  }

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

    const response = await fetch("/api/portals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...portalRequest,
        name,
        endpoint: testResult.endpoint,
        channelCount: testResult.channels.length,
        channels: testResult.channels,
      }),
    })
    const data = await response.json().catch(() => ({}))
    setIsSavingPortal(false)

    if (!response.ok) {
      setSaveError(data.error || "Could not save this portal.")
      return
    }

    if (data.portal) {
      onSaved(data.portal as SavedSourceRecord, testResult, portalRequest)
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
          <SheetHeader>
            <div className="flex min-w-0 flex-col gap-0.5 pr-8">
              <SheetTitle>Connection</SheetTitle>
              <SheetDescription>
                Enter the Stalker portal URL and your device identity details below.
              </SheetDescription>
            </div>
          </SheetHeader>

          <form onSubmit={onSubmit} className="flex flex-col flex-1 gap-0 overflow-hidden">
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-4 pt-0 pb-4">
                <FieldGroup>
                  <div className="grid gap-4">
                    <Tabs
                      value={form.sourceType}
                      onValueChange={(value) =>
                        updateField("sourceType", value as SourceType)
                      }
                    >
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="stalker">Stalker</TabsTrigger>
                        <TabsTrigger value="xtream">Xtream</TabsTrigger>
                        <TabsTrigger value="m3u">M3U</TabsTrigger>
                      </TabsList>
                    </Tabs>

                    {form.sourceType === "stalker" ? (
                      <>
                        <Field>
                          <div className="flex items-center justify-between gap-3">
                            <FieldLabel htmlFor="portalUrl">Portal URL</FieldLabel>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => setImportDialogOpen(true)}
                            >
                              <ClipboardPasteIcon data-icon="inline-start" />
                              Import text
                            </Button>
                          </div>
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
                        <SimpleInput
                          id="outputFormat"
                          label="Output format"
                          placeholder="m3u8"
                          value={form.outputFormat}
                          onChange={(value) => updateField("outputFormat", value)}
                        />
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
              <DialogTitle>Save source</DialogTitle>
              <DialogDescription>
                Add a nickname for this source so you can load it later.
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
                  onChange={(event) => setPortalName(event.target.value)}
                />
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
              <DialogTitle>Import portal text</DialogTitle>
              <DialogDescription>
                Paste a portal dump and Portal Hop will fill the connection fields it can find.
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="h-80 min-w-0 rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
              <Textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="Paste portal, MAC, serial, device IDs, and signature text..."
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
                onClick={importPortalText}
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
