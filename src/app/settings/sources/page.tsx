"use client";

import * as React from "react";
import {
  CopyIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TvIcon,
  WaypointsIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { SavedSourceRecord } from "@/lib/source-types";
import { useUserSettings } from "@/hooks/use-user-settings";
import { IPTV_ORG_SOURCE_NAME } from "@/lib/iptv-org";

const IPTV_ORG_GITHUB_URL = "https://github.com/iptv-org/iptv";
const IPTV_ORG_LOGO_BASE =
  "https://img.logo.dev/iptv-org.github.io?token=live_6a1a28fd-6420-4492-aeb0-b297461d9de2&size=128&retina=true&format=png";
const IPTV_ORG_LOGO_LIGHT = IPTV_ORG_LOGO_BASE;
const IPTV_ORG_LOGO_DARK = `${IPTV_ORG_LOGO_BASE}&theme=dark`;
import { AddPortalSheet } from "@/components/add-portal-sheet";
import { AuthDialog } from "@/components/auth-dialog";
import { SettingsHeader } from "@/components/settings-header";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { useAiSettings } from "@/hooks/use-ai-settings";

type SavedPortalRecord = SavedSourceRecord;

type EnrichProgress =
  | {
    type: "progress";
    stage: "scan" | "exact" | "ai";
    processed: number;
    total: number;
    matched: number;
  }
  | {
    type: "match";
    name: string;
    xmltvId: string;
    logoUrl: string;
    matched: number;
    processed: number;
    total: number;
  }
  | {
    type: "done";
    total: number;
    needing: number;
    matched: number;
    exact: number;
    aiResolved: number;
    aiCalls: number;
    aiFailed: number;
    aiAvailable: boolean;
    aiError: string | null;
    cleared: number;
  }
  | { type: "error"; error: string };

function EnrichMatchRow({
  name,
  xmltvId,
  logoUrl,
}: {
  name: string;
  xmltvId: string;
  logoUrl: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="size-5 shrink-0 rounded bg-muted/40 object-contain"
        />
      ) : (
        <span className="size-5 shrink-0 rounded bg-muted/40" />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {xmltvId}
      </span>
    </span>
  );
}

export default function SourcesSettingsPage() {
  const [addSourceOpen, setAddSourceOpen] = React.useState(false);
  const [savedPortals, setSavedPortals] = React.useState<SavedPortalRecord[]>(
    []
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const { settings, updateSettings, userId } = useUserSettings();
  const [authOpen, setAuthOpen] = React.useState(false);
  const activePortalIds = settings.enabledSourceIds;
  const useProxy = settings.useProxy;
  const [refetchingPortalId, setRefetchingPortalId] = React.useState<
    number | null
  >(null);
  const [copyingPortalId, setCopyingPortalId] = React.useState<number | null>(
    null
  );
  const [deletingPortalId, setDeletingPortalId] = React.useState<
    number | null
  >(null);
  const [enrichingPortalId, setEnrichingPortalId] = React.useState<
    number | null
  >(null);
  const [portalPendingDelete, setPortalPendingDelete] =
    React.useState<SavedPortalRecord | null>(null);
  const { settings: aiSettings } = useAiSettings();

  function handleUseProxyChange(nextUseProxy: boolean) {
    updateSettings({ useProxy: nextUseProxy });
  }

  function handleIptvOrgChange(enabled: boolean) {
    updateSettings({ iptvOrgEnabled: enabled });
  }

  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const response = await fetch("/api/portals", { cache: "no-store" });
        const data = await response.json().catch(() => ({ portals: [] }));

        if (!isMounted) return;

        setSavedPortals(Array.isArray(data.portals) ? data.portals : []);
      } catch {
        if (isMounted) setSavedPortals([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleCheckedChange(portal: SavedPortalRecord, checked: boolean) {
    const next = checked
      ? [...activePortalIds, portal.id]
      : activePortalIds.filter((id) => id !== portal.id);

    updateSettings({ enabledSourceIds: next });
  }

  async function handleRefetchPortal(portal: SavedPortalRecord) {
    setRefetchingPortalId(portal.id);
    const toastId = toast.loading(`Refetching ${portal.name}...`);

    try {
      const response = await fetch(`/api/portals/${portal.id}/refetch`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(`Failed to refetch ${portal.name}`, { id: toastId });
        return;
      }

      if (data.portal) {
        setSavedPortals((current) =>
          current.map((item) => (item.id === portal.id ? data.portal : item))
        );
      }

      toast.success(`${portal.name} refetched successfully`, { id: toastId });
    } catch {
      toast.error(`Failed to refetch ${portal.name}`, { id: toastId });
    } finally {
      setRefetchingPortalId(null);
    }
  }

  async function handleEnrichPortal(portal: SavedPortalRecord) {
    setEnrichingPortalId(portal.id);
    const toastId = toast.loading(`Enriching ${portal.name}...`, {
      description: "Matching channels to EPG data",
    });

    try {
      const response = await fetch(`/api/portals/${portal.id}/enrich`, {
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
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        toast.error(`Failed to enrich ${portal.name}`, {
          id: toastId,
          description: data.error,
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: Extract<EnrichProgress, { type: "done" }> | null = null;
      let streamError: string | null = null;
      let latestMatch: Extract<EnrichProgress, { type: "match" }> | null =
        null;
      // Keep the toast focused on the most recently reconciled channel while
      // avoiding an expensive render for every streamed match.
      let lastRender = 0;

      const renderMatch = (
        message: Extract<EnrichProgress, { type: "match" }>,
        force: boolean
      ) => {
        latestMatch = message;
        const now = Date.now();
        if (!force && now - lastRender < 75) return;
        lastRender = now;
        toast.loading(
          `Enriching ${portal.name}... · ${message.matched.toLocaleString()} updated`,
          {
            id: toastId,
            description: (
              <EnrichMatchRow
                name={message.name}
                xmltvId={message.xmltvId}
                logoUrl={message.logoUrl}
              />
            ),
          }
        );
      };

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let message: EnrichProgress;
        try {
          message = JSON.parse(line) as EnrichProgress;
        } catch {
          return;
        }

        if (message.type === "match") {
          renderMatch(message, false);
        } else if (message.type === "progress") {
          const label =
            message.stage === "ai"
              ? "AI reviewing candidate mappings"
              : message.stage === "exact"
                ? "Finding deterministic mappings"
                : "Preparing channel list";
          const progress = message.total
            ? `${message.processed.toLocaleString()}/${message.total.toLocaleString()}`
            : "";
          toast.loading(
            `Enriching ${portal.name}... · ${message.matched.toLocaleString()} updated`,
            {
              id: toastId,
              description: latestMatch ? (
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {label} · {progress}
                  </span>
                  <EnrichMatchRow
                    name={latestMatch.name}
                    xmltvId={latestMatch.xmltvId}
                    logoUrl={latestMatch.logoUrl}
                  />
                </span>
              ) : (
                `${label}${progress ? ` · ${progress}` : ""}`
              ),
            }
          );
        } else if (message.type === "done") {
          final = message;
        } else if (message.type === "error") {
          streamError = message.error;
        }
      };

      for (; ;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }
      if (buffer) handleLine(buffer);

      if (streamError) {
        toast.error(`Failed to enrich ${portal.name}`, {
          id: toastId,
          description: streamError,
        });
        return;
      }

      if (final) {
        const done: Extract<EnrichProgress, { type: "done" }> = final;
        const parts = [`${done.matched.toLocaleString()} XMLTV IDs updated`];
        if (done.aiResolved) {
          parts.push(`${done.aiResolved.toLocaleString()} via AI`);
        }
        if (!done.aiAvailable) {
          parts.push("AI not configured");
        } else if (done.aiResolved === 0 && done.aiFailed > 0) {
          parts.push(`AI error: ${done.aiError ?? "provider failed"}`);
        }
        toast.success(`${portal.name} enriched`, {
          id: toastId,
          description: parts.join(" · "),
        });
      } else {
        toast.success(`${portal.name} enriched`, { id: toastId });
      }
    } catch {
      toast.error(`Failed to enrich ${portal.name}`, { id: toastId });
    } finally {
      setEnrichingPortalId(null);
    }
  }

  async function handleDeletePortal(portal: SavedPortalRecord) {
    setDeletingPortalId(portal.id);
    const toastId = toast.loading(`Deleting ${portal.name}...`);

    try {
      const response = await fetch(`/api/portals/${portal.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        toast.error(`Failed to delete ${portal.name}`, { id: toastId });
        return;
      }

      setSavedPortals((current) =>
        current.filter((item) => item.id !== portal.id)
      );
      if (activePortalIds.includes(portal.id)) {
        updateSettings({
          enabledSourceIds: activePortalIds.filter((id) => id !== portal.id),
        });
      }
      toast.success(`${portal.name} deleted`, { id: toastId });
    } catch {
      toast.error(`Failed to delete ${portal.name}`, { id: toastId });
    } finally {
      setDeletingPortalId(null);
    }
  }

  async function handleCopyPlaylist(portal: SavedPortalRecord) {
    setCopyingPortalId(portal.id);

    try {
      const playlistUrl = new URL(
        `/api/portals/${portal.id}/playlist`,
        window.location.origin
      );

      await copyTextToClipboard(playlistUrl.href);
      toast.success("Copied M3U Plus playlist URL", {
        description: portal.name,
      });
    } catch (error) {
      toast.error("Could not copy playlist URL", {
        description:
          error instanceof Error ? error.message : "Clipboard unavailable.",
      });
    } finally {
      setCopyingPortalId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AddPortalSheet
        open={addSourceOpen}
        onOpenChange={setAddSourceOpen}
        onSaved={(portal) => {
          setSavedPortals((current) => [portal, ...current]);
        }}
      />

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} hideTrigger />

      <AlertDialog
        open={portalPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPortalPendingDelete(null);
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
                if (!portalPendingDelete) return;
                const portal = portalPendingDelete;
                setPortalPendingDelete(null);
                handleDeletePortal(portal);
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
        <Button
          type="button"
          size="sm"
          className="flex items-center justify-center gap-1.5 rounded-md"
          onClick={() =>
            userId ? setAddSourceOpen(true) : setAuthOpen(true)
          }
        >
          <PlusIcon className="size-4" />
          Add Source
        </Button>
      </div>

      <div className="flex w-full items-center justify-between gap-4 rounded-lg border bg-background/50 p-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="use-proxy">Use proxy</Label>
          <span className="text-xs text-muted-foreground">
            Try this if the stream isn&apos;t loading
          </span>
        </div>
        <Switch
          id="use-proxy"
          checked={useProxy}
          onCheckedChange={handleUseProxyChange}
          aria-label="Use proxy"
        />
      </div>

      <div className="flex w-full items-center justify-between gap-4 rounded-lg border bg-background/50 p-3">
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
            className="hidden size-8 shrink-0 rounded-md dark:block"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <a
              href={IPTV_ORG_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm font-medium leading-none underline-offset-4 hover:underline"
            >
              {IPTV_ORG_SOURCE_NAME}
            </a>
            <span className="text-xs text-muted-foreground">
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

      {savedPortals.length || isLoading ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-medium text-muted-foreground">
              Your sources
            </span>
            {savedPortals.length ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {activePortalIds.length} active
              </span>
            ) : null}
          </div>
          {savedPortals.length ? (
            <div className="flex flex-col divide-y divide-border/60">
              {savedPortals.map((portal) => {
                const isActive = activePortalIds.includes(portal.id);

                const isBusy =
                  refetchingPortalId === portal.id ||
                  copyingPortalId === portal.id ||
                  deletingPortalId === portal.id ||
                  enrichingPortalId === portal.id;

                return (
                  <div
                    key={portal.id}
                    className="group/source flex items-center gap-3 px-1 py-3"
                  >
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium",
                        isActive
                          ? "bg-primary/15 text-primary brightness-85 dark:bg-primary/15 dark:brightness-100"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {portal.name.charAt(0).toUpperCase()}
                    </div>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                      onClick={() => handleCheckedChange(portal, !isActive)}
                    >
                      <span className="w-full truncate text-sm font-medium">
                        {portal.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {sourceTypeLabel(portal.sourceType)} ·{" "}
                        {portal.channelCount.toLocaleString()} channels
                      </span>
                    </button>
                    <Switch
                      checked={isActive}
                      onCheckedChange={(checked) =>
                        handleCheckedChange(portal, checked)
                      }
                      aria-label={`Toggle ${portal.name}`}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={isBusy}
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
                      <DropdownMenuContent align="end" className="w-52! shadow-2xl shadow-primary/15">
                        {portal.sourceType === "stalker" ? (
                          <DropdownMenuItem
                            onClick={() => handleCopyPlaylist(portal)}
                          >
                            <CopyIcon className="size-4" />
                            Copy M3U Plus URL
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
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-1 py-3 text-sm">
              <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
              <ShimmeringText text="Loading saved sources." />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function sourceTypeLabel(sourceType: SavedSourceRecord["sourceType"]) {
  if (sourceType === "xtream") {
    return "Xtream";
  }

  if (sourceType === "m3u") {
    return "M3U";
  }

  return "Stalker";
}
