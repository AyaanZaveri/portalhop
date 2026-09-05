"use client"

import * as React from "react"
import {
  CopyIcon,
  ArrowUpDownIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SquarePenIcon,
  StarIcon,
  Trash2Icon,
  TvIcon,
  WaypointsIcon,
  GripVerticalIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { copyTextToClipboard } from "@/lib/clipboard"
import type { SavedSourceRecord } from "@portalhop/shared/source-types"
import { useUserSettings } from "@/hooks/use-user-settings"
import { IPTV_ORG_SOURCE_NAME } from "@/lib/iptv-org"
import { proxyImageUrl } from "@portalhop/shared/image-proxy"
import { prunePortalChannelsCache } from "@/lib/portal-channels-cache"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const IPTV_ORG_GITHUB_URL = "https://github.com/iptv-org/iptv"
const IPTV_ORG_LOGO_BASE =
  "https://img.logo.dev/iptv-org.github.io?token=live_6a1a28fd-6420-4492-aeb0-b297461d9de2&size=128&retina=true&format=png"
const IPTV_ORG_LOGO_LIGHT = IPTV_ORG_LOGO_BASE
const IPTV_ORG_LOGO_DARK = `${IPTV_ORG_LOGO_BASE}&theme=dark`
import { AddPortalSheet } from "@/components/add-portal-sheet"
import { AuthDialog } from "@/components/auth-dialog"
import { SettingsHeader } from "@/components/settings-header"
import { ShimmeringText } from "@/components/ui/shimmering-text"
import { useAiSettings } from "@/hooks/use-ai-settings"
import { apiFetch, absoluteApiUrl } from "@/lib/api-fetch"
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable"

type SavedPortalRecord = SavedSourceRecord

type EnrichProgress =
  | {
    type: "progress"
    stage: "scan" | "exact" | "ai"
    processed: number
    total: number
    matched: number
  }
  | {
    type: "match"
    name: string
    xmltvId: string
    logoUrl: string
    matched: number
    processed: number
    total: number
  }
  | {
    type: "done"
    total: number
    needing: number
    matched: number
    exact: number
    aiResolved: number
    aiCalls: number
    aiFailed: number
    aiAvailable: boolean
    aiError: string | null
    cleared: number
  }
  | { type: "error"; error: string }

function EnrichMatchRow({
  name,
  xmltvId,
  logoUrl,
  useImageProxy,
}: {
  name: string
  xmltvId: string
  logoUrl: string
  useImageProxy: boolean
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxyImageUrl(logoUrl, useImageProxy)}
          alt=""
          className="bg-muted/40 size-5 shrink-0 rounded object-contain"
        />
      ) : (
        <span className="bg-muted/40 size-5 shrink-0 rounded" />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
        {xmltvId}
      </span>
    </span>
  )
}

export default function SourcesSettingsPage() {
  const [addSourceOpen, setAddSourceOpen] = React.useState(false)
  const [reorderingSources, setReorderingSources] = React.useState(false)
  const [savedPortals, setSavedPortals] = React.useState<SavedPortalRecord[]>(
    [],
  )
  const [isLoading, setIsLoading] = React.useState(true)
  const { settings, updateSettings, userId } = useUserSettings()
  const [authOpen, setAuthOpen] = React.useState(false)
  const activePortalIds = settings.enabledSourceIds
  const useProxy = settings.useProxy
  const [refetchingPortalId, setRefetchingPortalId] = React.useState<
    number | null
  >(null)
  const [isRefetchingActive, setIsRefetchingActive] = React.useState(false)
  const [copyingPortalId, setCopyingPortalId] = React.useState<number | null>(
    null,
  )
  const [deletingPortalId, setDeletingPortalId] = React.useState<number | null>(
    null,
  )
  const [enrichingPortalId, setEnrichingPortalId] = React.useState<
    number | null
  >(null)
  const [portalPendingDelete, setPortalPendingDelete] =
    React.useState<SavedPortalRecord | null>(null)
  const [editingPortal, setEditingPortal] =
    React.useState<SavedPortalRecord | null>(null)
  const [portalPendingRename, setPortalPendingRename] =
    React.useState<SavedPortalRecord | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [renameError, setRenameError] = React.useState("")
  const [isRenamingPortal, setIsRenamingPortal] = React.useState(false)
  const [isClearingCache, setIsClearingCache] = React.useState(false)
  const [isCopyingFavorites, setIsCopyingFavorites] = React.useState(false)
  const [isRegeneratingFavorites, setIsRegeneratingFavorites] =
    React.useState(false)
  const [regenerateFavoritesOpen, setRegenerateFavoritesOpen] =
    React.useState(false)
  const { settings: aiSettings } = useAiSettings()

  function handleUseProxyChange(nextUseProxy: boolean) {
    updateSettings({ useProxy: nextUseProxy })
  }

  async function handleForceRefresh() {
    setIsClearingCache(true)
    try {
      // Passing an empty keep-list drops every cached source's channel
      // snapshot, so the browser refetches everything fresh next load.
      await prunePortalChannelsCache([])
      toast.success("Channel cache cleared", {
        description: "Sources will refetch fresh data next time you open them.",
      })
    } catch {
      toast.error("Could not clear the channel cache")
    } finally {
      setIsClearingCache(false)
    }
  }

  function handleIptvOrgChange(enabled: boolean) {
    updateSettings({ iptvOrgEnabled: enabled })
  }

  async function handleCopyFavoritesPlaylist() {
    setIsCopyingFavorites(true)
    try {
      const res = await apiFetch("/api/favorites/token")
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url)
        throw new Error(data.error || "Could not create a playlist link.")
      await copyTextToClipboard(data.url)
      toast.success("Copied favorites playlist URL", {
        description: "Includes logos and EPG ids for every favorited channel.",
      })
    } catch (error) {
      toast.error("Could not copy playlist URL", {
        description: error instanceof Error ? error.message : "Unavailable.",
      })
    } finally {
      setIsCopyingFavorites(false)
    }
  }

  async function handleRegenerateFavoritesPlaylist() {
    setIsRegeneratingFavorites(true)
    try {
      const res = await apiFetch("/api/favorites/token", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url)
        throw new Error(data.error || "Could not regenerate the playlist link.")
      await copyTextToClipboard(data.url)
      toast.success("Regenerated and copied a new playlist URL", {
        description: "The previous link no longer works.",
      })
      setRegenerateFavoritesOpen(false)
    } catch (error) {
      toast.error("Could not regenerate the playlist link", {
        description: error instanceof Error ? error.message : "Unavailable.",
      })
    } finally {
      setIsRegeneratingFavorites(false)
    }
  }

  React.useEffect(() => {
    let isMounted = true

      ; (async () => {
        try {
          const response = await apiFetch("/api/portals", { cache: "no-store" })
          const data = await response.json().catch(() => ({ portals: [] }))

          if (!isMounted) return

          setSavedPortals(Array.isArray(data.portals) ? data.portals : [])
        } catch {
          if (isMounted) setSavedPortals([])
        } finally {
          if (isMounted) setIsLoading(false)
        }
      })()

    return () => {
      isMounted = false
    }
  }, [])

  function handleCheckedChange(portal: SavedPortalRecord, checked: boolean) {
    const next = checked
      ? [...activePortalIds, portal.id]
      : activePortalIds.filter((id) => id !== portal.id)

    updateSettings({ enabledSourceIds: next })
  }

  /**
   * Refetch one source and fold the returned record back into the list. Kept
   * free of toasts so a single refetch and a run over every active source can
   * each narrate the run their own way.
   */
  async function refetchPortal(portal: SavedPortalRecord) {
    try {
      const response = await apiFetch(`/api/portals/${portal.id}/refetch`, {
        method: "POST",
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        return false
      }

      if (data.portal) {
        setSavedPortals((current) =>
          current.map((item) => (item.id === portal.id ? data.portal : item)),
        )
      }

      return true
    } catch {
      return false
    }
  }

  async function handleRefetchPortal(portal: SavedPortalRecord) {
    setRefetchingPortalId(portal.id)
    const toastId = toast.loading(`Refetching ${portal.name}...`)
    const startedAt = performance.now()

    const succeeded = await refetchPortal(portal)
    setRefetchingPortalId(null)

    if (!succeeded) {
      toast.error(`Failed to refetch ${portal.name}`, { id: toastId })
      return
    }

    toast.success(
      `${portal.name} refetched in ${formatElapsed(performance.now() - startedAt)}`,
      { id: toastId },
    )
  }

  async function handleRefetchActivePortals() {
    const portals = savedPortals.filter((portal) =>
      activePortalIds.includes(portal.id),
    )
    if (!portals.length) return

    setIsRefetchingActive(true)
    const toastId = toast.loading(`Refetching 1 of ${portals.length}...`, {
      description: portals[0].name,
    })
    const startedAt = performance.now()
    const failed: string[] = []

    // One at a time. Each refetch pulls a provider's entire channel list and
    // writes it in a transaction, and firing a dozen of those at once is how
    // both the provider and the connection pool start refusing.
    for (const [index, portal] of portals.entries()) {
      toast.loading(`Refetching ${index + 1} of ${portals.length}...`, {
        id: toastId,
        description: portal.name,
      })
      setRefetchingPortalId(portal.id)
      if (!(await refetchPortal(portal))) {
        failed.push(portal.name)
      }
    }

    setRefetchingPortalId(null)
    setIsRefetchingActive(false)

    const elapsed = formatElapsed(performance.now() - startedAt)

    if (failed.length === portals.length) {
      toast.error("Could not refetch your active sources", { id: toastId })
      return
    }

    toast.success(
      `${portals.length - failed.length} of ${portals.length} refetched in ${elapsed}`,
      {
        id: toastId,
        description: failed.length ? `Failed: ${failed.join(", ")}` : undefined,
      },
    )
  }

  async function handleEnrichPortal(portal: SavedPortalRecord) {
    setEnrichingPortalId(portal.id)
    const toastId = toast.loading(`Enriching ${portal.name}...`, {
      description: "Matching channels to EPG data",
    })

    try {
      const response = await apiFetch(`/api/portals/${portal.id}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force: true,
          settings: {
            // Only send browser-saved credentials when the user explicitly
            // chose to override .env. Otherwise the route resolves its own
            // server-side provider credentials.
            baseUrl: aiSettings.overrideEnv
              ? (aiSettings.customBaseUrl ?? "")
              : "",
            apiKey: aiSettings.overrideEnv
              ? (aiSettings.customApiKey ?? "")
              : "",
            // When using server credentials, let the server's tested model be
            // authoritative. This avoids a stale browser localStorage value
            // sending a model id that NVIDIA no longer serves.
            model: aiSettings.overrideEnv ? aiSettings.model : "",
            reasoningEffort: aiSettings.reasoningEffort,
          },
        }),
      })

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}))
        toast.error(`Failed to enrich ${portal.name}`, {
          id: toastId,
          description: data.error,
        })
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let final: Extract<EnrichProgress, { type: "done" }> | null = null
      let streamError: string | null = null
      let latestMatch: Extract<EnrichProgress, { type: "match" }> | null = null
      // Keep the toast focused on the most recently reconciled channel while
      // avoiding an expensive render for every streamed match.
      let lastRender = 0

      const renderMatch = (
        message: Extract<EnrichProgress, { type: "match" }>,
        force: boolean,
      ) => {
        latestMatch = message
        const now = Date.now()
        if (!force && now - lastRender < 75) return
        lastRender = now
        toast.loading(
          `Enriching ${portal.name}... · ${message.matched.toLocaleString()} updated`,
          {
            id: toastId,
            description: (
              <EnrichMatchRow
                name={message.name}
                xmltvId={message.xmltvId}
                logoUrl={message.logoUrl}
                useImageProxy={settings.useImageProxy}
              />
            ),
          },
        )
      }

      const handleLine = (line: string) => {
        if (!line.trim()) return
        let message: EnrichProgress
        try {
          message = JSON.parse(line) as EnrichProgress
        } catch {
          return
        }

        if (message.type === "match") {
          renderMatch(message, false)
        } else if (message.type === "progress") {
          const label =
            message.stage === "ai"
              ? "AI reviewing candidate mappings"
              : message.stage === "exact"
                ? "Finding deterministic mappings"
                : "Preparing channel list"
          const progress = message.total
            ? `${message.processed.toLocaleString()}/${message.total.toLocaleString()}`
            : ""
          toast.loading(
            `Enriching ${portal.name}... · ${message.matched.toLocaleString()} updated`,
            {
              id: toastId,
              description: latestMatch ? (
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs">
                    {label} · {progress}
                  </span>
                  <EnrichMatchRow
                    name={latestMatch.name}
                    xmltvId={latestMatch.xmltvId}
                    logoUrl={latestMatch.logoUrl}
                    useImageProxy={settings.useImageProxy}
                  />
                </span>
              ) : (
                `${label}${progress ? ` · ${progress}` : ""}`
              ),
            },
          )
        } else if (message.type === "done") {
          final = message
        } else if (message.type === "error") {
          streamError = message.error
        }
      }

      for (; ;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) handleLine(line)
      }
      if (buffer) handleLine(buffer)

      if (streamError) {
        toast.error(`Failed to enrich ${portal.name}`, {
          id: toastId,
          description: streamError,
        })
        return
      }

      if (final) {
        const done: Extract<EnrichProgress, { type: "done" }> = final
        const parts = [`${done.matched.toLocaleString()} XMLTV IDs updated`]
        if (done.aiResolved) {
          parts.push(`${done.aiResolved.toLocaleString()} via AI`)
        }
        if (!done.aiAvailable) {
          parts.push("AI not configured")
        } else if (done.aiResolved === 0 && done.aiFailed > 0) {
          parts.push(`AI error: ${done.aiError ?? "provider failed"}`)
        }
        toast.success(`${portal.name} enriched`, {
          id: toastId,
          description: parts.join(" · "),
        })
      } else {
        toast.success(`${portal.name} enriched`, { id: toastId })
      }
    } catch {
      toast.error(`Failed to enrich ${portal.name}`, { id: toastId })
    } finally {
      setEnrichingPortalId(null)
    }
  }

  async function handleDeletePortal(portal: SavedPortalRecord) {
    setDeletingPortalId(portal.id)
    const toastId = toast.loading(`Deleting ${portal.name}...`)

    try {
      const response = await apiFetch(`/api/portals/${portal.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        toast.error(`Failed to delete ${portal.name}`, { id: toastId })
        return
      }

      setSavedPortals((current) =>
        current.filter((item) => item.id !== portal.id),
      )
      if (activePortalIds.includes(portal.id)) {
        updateSettings({
          enabledSourceIds: activePortalIds.filter((id) => id !== portal.id),
        })
      }
      toast.success(`${portal.name} deleted`, { id: toastId })
    } catch {
      toast.error(`Failed to delete ${portal.name}`, { id: toastId })
    } finally {
      setDeletingPortalId(null)
    }
  }

  async function handleCopyPlaylist(portal: SavedPortalRecord) {
    setCopyingPortalId(portal.id)

    try {
      const playlistUrl = absoluteApiUrl(`/api/portals/${portal.id}/playlist`)

      await copyTextToClipboard(playlistUrl)
      toast.success("Copied M3U Plus playlist URL", {
        description: portal.name,
      })
    } catch (error) {
      toast.error("Could not copy playlist URL", {
        description:
          error instanceof Error ? error.message : "Clipboard unavailable.",
      })
    } finally {
      setCopyingPortalId(null)
    }
  }

  async function handleRenamePortal() {
    if (!portalPendingRename) return

    const name = renameValue.trim()

    if (!name) {
      setRenameError("Enter a nickname.")
      return
    }

    setIsRenamingPortal(true)
    setRenameError("")

    try {
      const response = await apiFetch(`/api/portals/${portalPendingRename.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setRenameError(data.error || "Could not rename this source.")
        return
      }

      if (data.portal) {
        setSavedPortals((current) =>
          current.map((item) =>
            item.id === portalPendingRename.id
              ? { ...item, name: data.portal.name }
              : item,
          ),
        )
      }

      toast.success("Source renamed", { description: name })
      setPortalPendingRename(null)
    } catch {
      setRenameError("Could not rename this source.")
    } finally {
      setIsRenamingPortal(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AddPortalSheet
        open={addSourceOpen}
        onOpenChange={(nextOpen) => {
          setAddSourceOpen(nextOpen)
          if (!nextOpen) setEditingPortal(null)
        }}
        editingPortal={editingPortal}
        onSaved={(portal) => {
          setSavedPortals((current) => [portal, ...current])
        }}
        onUpdated={(portal) => {
          setSavedPortals((current) =>
            current.map((item) => (item.id === portal.id ? portal : item)),
          )
        }}
      />

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} hideTrigger />

      <Dialog
        open={portalPendingRename !== null}
        onOpenChange={(open) => {
          if (!open) setPortalPendingRename(null)
        }}
      >
        <DialogContent>
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Rename source</DialogTitle>
              <DialogDescription>
                Choose a new nickname for &quot;{portalPendingRename?.name}
                &quot;.
              </DialogDescription>
            </DialogHeader>

            <Field data-invalid={Boolean(renameError)}>
              <FieldLabel htmlFor="renamePortal">Nickname</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="renamePortal"
                  placeholder="Living room IPTV"
                  value={renameValue}
                  aria-invalid={Boolean(renameError)}
                  onChange={(event) => {
                    setRenameValue(event.target.value)
                    setRenameError("")
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      handleRenamePortal()
                    }
                  }}
                />
                <InputGroupAddon align="inline-start">
                  <TvIcon />
                </InputGroupAddon>
              </InputGroup>
              {renameError ? (
                <FieldDescription>{renameError}</FieldDescription>
              ) : null}
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPortalPendingRename(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isRenamingPortal}
                onClick={handleRenamePortal}
              >
                {isRenamingPortal ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PencilIcon className="size-4" />
                )}
                Rename
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={portalPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPortalPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &quot;{portalPendingDelete?.name}
              &quot; and its saved channels. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!portalPendingDelete) return
                const portal = portalPendingDelete
                setPortalPendingDelete(null)
                handleDeletePortal(portal)
              }}
            >
              <Trash2Icon className="size-4" />
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-start justify-between gap-4">
        <SettingsHeader icon={TvIcon} title="Sources" />
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="rounded-md"
                  disabled={isClearingCache}
                  onClick={handleForceRefresh}
                  aria-label="Force refresh channel cache"
                >
                  {isClearingCache ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="size-4" />
                  )}
                </Button>
              }
            />
            <TooltipContent align="center">
              Clear the local channel cache
            </TooltipContent>
          </Tooltip>
          <Button
            type="button"
            size="sm"
            className="flex items-center justify-center gap-1.5 rounded-md"
            onClick={() => {
              if (!userId) {
                setAuthOpen(true)
                return
              }
              setEditingPortal(null)
              setAddSourceOpen(true)
            }}
          >
            <PlusIcon className="size-4" />
            Add Source
          </Button>
        </div>
      </div>

      <div className="bg-background/50 flex w-full items-center justify-between gap-4 rounded-lg border p-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="use-proxy">Use proxy</Label>
          <span className="text-muted-foreground text-xs">
            Try this if the stream isn&apos;t loading, helps with HTTP-only or
            geo-restricted streams.
          </span>
        </div>
        <Switch
          id="use-proxy"
          checked={useProxy}
          onCheckedChange={handleUseProxyChange}
          aria-label="Use proxy"
        />
      </div>

      <div className="bg-background/50 flex w-full items-center justify-between gap-4 rounded-lg border p-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={IPTV_ORG_LOGO_LIGHT}
            alt=""
            className="size-8 shrink-0 rounded-md dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={IPTV_ORG_LOGO_DARK}
            alt=""
            className="hidden size-8 shrink-0 rounded-md dark:block dark:brightness-0 dark:invert"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <a
              href={IPTV_ORG_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm leading-none font-medium underline-offset-4 hover:underline"
            >
              {IPTV_ORG_SOURCE_NAME}
            </a>
            <span className="text-muted-foreground text-xs">
              Publicly available IPTV channels, shown by default
            </span>
          </div>
        </div>
        <Switch
          id="iptv-org"
          checked={settings.iptvOrgEnabled}
          onCheckedChange={handleIptvOrgChange}
          aria-label="Show IPTV-org channels"
        />
      </div>

      <div className="bg-background/50 flex w-full items-center justify-between gap-4 rounded-lg border p-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-primary/15 text-primary flex size-8 shrink-0 items-center justify-center rounded-md brightness-85 dark:brightness-100">
            <StarIcon className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="w-fit text-sm leading-none font-medium">
              Favorites playlist
            </span>
            <span className="text-muted-foreground text-xs">
              M3U Plus link with logos and EPG ids for every favorited channel
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isRegeneratingFavorites}
                  onClick={() => setRegenerateFavoritesOpen(true)}
                  aria-label="Regenerate favorites playlist link"
                >
                  <RefreshCwIcon className="size-4" />
                </Button>
              }
            />
            <TooltipContent align="center">
              Regenerate link, invalidating the old one
            </TooltipContent>
          </Tooltip>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={isCopyingFavorites}
            onClick={handleCopyFavoritesPlaylist}
          >
            {isCopyingFavorites ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CopyIcon className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={regenerateFavoritesOpen}
        onOpenChange={(open) =>
          !isRegeneratingFavorites && setRegenerateFavoritesOpen(open)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate playlist link?</AlertDialogTitle>
            <AlertDialogDescription>
              The current favorites playlist URL will stop working immediately.
              Any player using it will need the new link, which gets copied to
              your clipboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRegeneratingFavorites}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={isRegeneratingFavorites}
              onClick={handleRegenerateFavoritesPlaylist}
            >
              {isRegeneratingFavorites ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <RefreshCwIcon />
              )}
              Regenerate
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {savedPortals.length || isLoading ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-muted-foreground text-sm font-medium">
              Your sources
            </span>
            {savedPortals.length ? (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-xs tabular-nums">
                  {activePortalIds.length} active
                </span>
                {activePortalIds.length ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isRefetchingActive}
                          onClick={handleRefetchActivePortals}
                          aria-label="Refetch active sources"
                        >
                          {isRefetchingActive ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <RefreshCwIcon className="size-4" />
                          )}
                        </Button>
                      }
                    />
                    <TooltipContent align="center">
                      Refetch every active source
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                {savedPortals.length > 1 ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={reorderingSources ? "Finish reordering sources" : "Reorder playback priority"}
                          aria-pressed={reorderingSources}
                          onClick={() => setReorderingSources((value) => !value)}
                        >
                          <ArrowUpDownIcon className="size-4" />
                        </Button>
                      }
                    />
                    <TooltipContent align="center">Reorder playback priority</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            ) : null}
          </div>
          {savedPortals.length ? (
            <Sortable
              value={[...savedPortals].sort((a, b) => (settings.sourcePriorityIds.indexOf(a.id) === -1 ? Number.MAX_SAFE_INTEGER : settings.sourcePriorityIds.indexOf(a.id)) - (settings.sourcePriorityIds.indexOf(b.id) === -1 ? Number.MAX_SAFE_INTEGER : settings.sourcePriorityIds.indexOf(b.id)))}
              getItemValue={(portal) => String(portal.id)}
              onValueChange={(items) => updateSettings({ sourcePriorityIds: items.map((item) => item.id) })}
              className="flex flex-col"
            >
              {[...savedPortals].sort((a, b) => (settings.sourcePriorityIds.indexOf(a.id) === -1 ? Number.MAX_SAFE_INTEGER : settings.sourcePriorityIds.indexOf(a.id)) - (settings.sourcePriorityIds.indexOf(b.id) === -1 ? Number.MAX_SAFE_INTEGER : settings.sourcePriorityIds.indexOf(b.id))).map((portal) => {
                const isActive = activePortalIds.includes(portal.id)

                // During a bulk refresh, only the source currently on the
                // network gets a loader. Other rows remain visibly intact,
                // though their actions stay disabled until the run finishes.
                const isBusy =
                  refetchingPortalId === portal.id ||
                  copyingPortalId === portal.id ||
                  deletingPortalId === portal.id ||
                  enrichingPortalId === portal.id
                const isActionsDisabled = isRefetchingActive || isBusy

                return (
                  <SortableItem key={portal.id} value={String(portal.id)} disabled={!reorderingSources} className="opacity-100">
                  <SortableItemHandle
                    role="button"
                    tabIndex={0}
                    className="group/source hover:bg-accent/50 focus-visible:bg-accent/50 -mx-2 flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 outline-none"
                    onClick={() => handleCheckedChange(portal, !isActive)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        handleCheckedChange(portal, !isActive)
                      }
                    }}
                  >
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium",
                        isActive
                          ? "bg-primary/15 text-primary dark:bg-primary/15 brightness-85 dark:brightness-100"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {portal.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                      <span className="w-full truncate text-sm font-medium">
                        {portal.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {sourceTypeLabel(portal.sourceType)} ·{" "}
                        {portal.channelCount.toLocaleString()} channels
                      </span>
                    </div>
                    {reorderingSources ? <GripVerticalIcon className="text-muted-foreground size-4 shrink-0" /> : null}
                    <Switch
                      checked={isActive}
                      onCheckedChange={(checked) =>
                        handleCheckedChange(portal, checked)
                      }
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Toggle ${portal.name}`}
                    />
                    <div onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={isActionsDisabled}
                              aria-label={`More actions for ${portal.name}`}
                            >
                              {isBusy ? (
                                <Loader2Icon className="size-4 animate-spin" />
                              ) : (
                                <MoreHorizontalIcon className="size-4" />
                              )}
                            </Button>
                          }
                        />
                        <DropdownMenuContent
                          align="end"
                          className="shadow-primary/15 w-52! shadow-2xl"
                        >
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingPortal(portal)
                              setAddSourceOpen(true)
                            }}
                          >
                            <SquarePenIcon className="size-4" />
                            Edit connection
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameValue(portal.name)
                              setRenameError("")
                              setPortalPendingRename(portal)
                            }}
                          >
                            <PencilIcon className="size-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {portal.sourceType === "stalker" ? (
                            <DropdownMenuItem
                              onClick={() => handleCopyPlaylist(portal)}
                            >
                              <CopyIcon className="size-4" />
                              Copy{" "}
                              <span className="font-mono font-medium tracking-tight">
                                m3u_plus
                              </span>{" "}
                              URL
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            onClick={() => handleRefetchPortal(portal)}
                          >
                            <RefreshCwIcon className="size-4" />
                            Refetch source
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleEnrichPortal(portal)}
                          >
                            <WaypointsIcon className="size-4" />
                            Auto-match guide
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setPortalPendingDelete(portal)}
                          >
                            <Trash2Icon className="size-4" />
                            Delete source
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </SortableItemHandle>
                  </SortableItem>
                )
              })}
            </Sortable>
          ) : (
            <div className="flex items-center gap-2 px-1 py-3 text-sm">
              <Loader2Icon className="text-muted-foreground size-4 shrink-0 animate-spin" />
              <ShimmeringText text="Loading saved sources." />
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function sourceTypeLabel(sourceType: SavedSourceRecord["sourceType"]) {
  if (sourceType === "xtream") {
    return "Xtream"
  }

  if (sourceType === "m3u") {
    return "M3U"
  }

  return "Stalker"
}

/**
 * Wall-clock duration for a finished refetch, from the user's side rather than
 * the server's: a large source spends real time fetching the provider's list
 * and streaming it into Postgres, and the whole wait is what's worth reporting.
 */
function formatElapsed(ms: number) {
  const seconds = ms / 1000

  // Round to whole seconds only once a refetch is slow enough for the decimal
  // to be noise, but keep it below 1s so a fast source never reads as "0s".
  if (seconds < 1) {
    return `${seconds.toFixed(1)}s`
  }

  const total = Math.round(seconds)

  if (total < 60) {
    return `${total}s`
  }

  return `${Math.floor(total / 60)}m ${total % 60}s`
}
