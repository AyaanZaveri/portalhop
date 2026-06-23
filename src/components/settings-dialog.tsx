"use client";

import * as React from "react";
import {
  CheckIcon,
  CopyIcon,
  GlobeIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  TvIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EpgManifest } from "@/lib/epg-store";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "next-themes";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { SavedSourceRecord } from "@/lib/source-types";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { useAiSettings } from "@/hooks/use-ai-settings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logoSource: "provider" | "epg";
  onLogoSourceChange: (source: "provider" | "epg") => void;
  epgManifest: EpgManifest | null;
  onRefetchComplete: () => Promise<void>;
  savedPortals: SavedPortalRecord[];
  activePortalIds: number[];
  isLoadingPortals: boolean;
  loadingPortalId: number | null;
  refetchingPortalId: number | null;
  onAddPortal: () => void;
  onPortalCheckedChange: (
    portal: SavedPortalRecord,
    checked: boolean
  ) => void | Promise<void>;
  onRefetchPortal: (portal: SavedPortalRecord) => void | Promise<void>;
}

interface SettingsDialogTriggerProps {
  onOpen: () => void;
}

type SavedPortalRecord = SavedSourceRecord;

interface ModelInfo {
  id: string;
}

interface ModelsResponse {
  data?: ModelInfo[];
}

export function SettingsDialogTrigger({ onOpen }: SettingsDialogTriggerProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 cursor-pointer rounded-md text-muted-foreground hover:text-foreground"
      onClick={onOpen}
      aria-label="Settings"
    >
      <SettingsIcon className="size-4" />
    </Button>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  logoSource,
  onLogoSourceChange,
  epgManifest,
  onRefetchComplete,
  savedPortals,
  activePortalIds,
  isLoadingPortals,
  loadingPortalId,
  refetchingPortalId,
  onAddPortal,
  onPortalCheckedChange,
  onRefetchPortal,
}: SettingsDialogProps) {
  const [isRefetching, setIsRefetching] = React.useState(false);
  const [copyingPortalId, setCopyingPortalId] = React.useState<number | null>(
    null
  );
  const contentRef = React.useRef<HTMLDivElement>(null);
  const { settings, saveSettings, mounted, envBaseUrl, envApiKey } =
    useAiSettings();
  const [model, setModel] = React.useState("");
  const [overrideEnv, setOverrideEnv] = React.useState(false);
  const [customBaseUrl, setCustomBaseUrl] = React.useState("");
  const [customApiKey, setCustomApiKey] = React.useState("");
  const [reasoningEffort, setReasoningEffort] = React.useState<
    "none" | "low" | "medium" | "high" | "max"
  >("none");
  const [models, setModels] = React.useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = React.useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const epgLogoUrl = isDark
    ? "https://img.logo.dev/iptv-epg.org?token=live_6a1a28fd-6420-4492-aeb0-b297461d9de2&size=128&retina=true&format=png"
    : "https://www.google.com/s2/favicons?sz=64&domain=iptv-epg.org";

  const handleRefetch = async () => {
    setIsRefetching(true);
    const toastId = toast.loading("Refetching EPG data from iptv-epg.org...");
    try {
      const res = await fetch("/api/epg", { method: "POST" });
      if (!res.ok) throw new Error("Refetch failed");
      await onRefetchComplete();
      toast.success("EPG data updated successfully", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Failed to refetch EPG data", { id: toastId });
    } finally {
      setIsRefetching(false);
    }
  };

  React.useEffect(() => {
    if (mounted && open) {
      queueMicrotask(() => {
        setModel(settings.model);
        setOverrideEnv(settings.overrideEnv ?? false);
        setCustomBaseUrl(settings.customBaseUrl ?? "");
        setCustomApiKey(settings.customApiKey ?? "");
        setReasoningEffort(settings.reasoningEffort ?? "none");
      });
    }
  }, [mounted, open, settings]);

  const fetchModels = React.useCallback(async (url?: string, key?: string) => {
    setFetchingModels(true);
    try {
      const res = await fetch("/api/ai-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: url ?? "", apiKey: key ?? "" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: ModelsResponse = await res.json();
      const ids = (data.data ?? []).map((item) => item.id).filter(Boolean);
      setModels(ids);
      if (ids.length === 0) {
        toast.error("No models found at this endpoint.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch models";
      toast.error(message);
      setModels([]);
    } finally {
      setFetchingModels(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    if (!overrideEnv) {
      if (envBaseUrl && envApiKey) {
        void Promise.resolve().then(() => fetchModels());
      }
    } else if (customBaseUrl.trim() && customApiKey.trim()) {
      void Promise.resolve().then(() =>
        fetchModels(customBaseUrl, customApiKey)
      );
    }
  }, [
    open,
    overrideEnv,
    customBaseUrl,
    customApiKey,
    envBaseUrl,
    envApiKey,
    fetchModels,
  ]);

  const normalizedModel = model ?? "";
  const envConfigured = envBaseUrl && envApiKey;
  const canSaveAiSettings =
    normalizedModel.trim().length > 0 &&
    (envConfigured ||
      (overrideEnv &&
        customBaseUrl.trim().length > 0 &&
        customApiKey.trim().length > 0));

  function handleSaveAiSettings() {
    saveSettings({
      model: normalizedModel.trim(),
      reasoningEffort,
      overrideEnv,
      customBaseUrl: overrideEnv ? customBaseUrl.trim() : "",
      customApiKey: overrideEnv ? customApiKey.trim() : "",
    });
    toast.success("AI settings saved");
  }

  async function handleCopyPlaylist(portal: SavedPortalRecord) {
    if (typeof window === "undefined") {
      toast.error("Could not copy playlist URL.");
      return;
    }

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

  // Count total channels in manifest
  const totalChannels = epgManifest?.countries.reduce((sum, c) => sum + c.count, 0) ?? 0;

  const formatLastFetched = (timestamp: number | null) => {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="top-12! bottom-12! flex! h-auto! max-h-none! translate-y-0! flex-col overflow-x-hidden overflow-y-hidden sm:max-w-lg"
      >
          <DialogHeader className="shrink-0">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Configure Portal Hop preferences and EPG data synchronization.
            </DialogDescription>
          </DialogHeader>

        <ScrollArea className="-mr-4 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-4">
          <div className="flex min-w-0 flex-col gap-4 px-1 py-2 pr-3">
            {/* EPG Source Preference */}
            <div className="flex flex-col gap-1.5">
              <span className="text-base font-medium text-foreground">
                EPG Source
              </span>
              <Tabs
                value={logoSource}
                onValueChange={(value) => onLogoSourceChange(value as "provider" | "epg")}
              >
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="provider">
                    <GlobeIcon className="size-3.5 shrink-0" />
                    Portal
                  </TabsTrigger>
                  <TabsTrigger value="epg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={epgLogoUrl}
                      alt=""
                      className="size-3.5 shrink-0 rounded-xs"
                    />
                    iptv-epg.org
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-base font-medium text-foreground">
                Sources
              </span>
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {savedPortals.length ? (
                  savedPortals.map((portal) => {
                    const isActive = activePortalIds.includes(portal.id);

                    return (
                      <div
                        key={portal.id}
                        className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                      >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md">
                        <span className="flex size-8 items-center justify-center rounded-md bg-muted/50">
                          <TvIcon className="size-4 text-muted-foreground" />
                        </span>
                      </div>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                        onClick={() => onPortalCheckedChange(portal, !isActive)}
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
                          onPortalCheckedChange(portal, checked)
                        }
                        disabled={loadingPortalId === portal.id}
                        aria-label={`Toggle ${portal.name}`}
                      />
                      {portal.sourceType === "stalker" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={
                            loadingPortalId === portal.id ||
                            refetchingPortalId === portal.id ||
                            copyingPortalId === portal.id
                          }
                          onClick={() => handleCopyPlaylist(portal)}
                          aria-label={`Copy M3U Plus playlist URL for ${portal.name}`}
                        >
                          {copyingPortalId === portal.id ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <CopyIcon className="size-4" />
                          )}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={
                          loadingPortalId === portal.id ||
                          refetchingPortalId === portal.id
                        }
                        onClick={() => onRefetchPortal(portal)}
                        aria-label="Refetch source"
                      >
                        {refetchingPortalId === portal.id ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          <RefreshCwIcon className="size-4" />
                        )}
                      </Button>
                    </div>
                    );
                  })
                ) : (
                  <p className="px-1 py-3 text-sm text-muted-foreground">
                    {isLoadingPortals
                      ? "Loading saved sources."
                      : "Successful connections can be saved here."}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 w-full flex items-center justify-center gap-1.5 cursor-pointer rounded-md"
                onClick={() => {
                  onOpenChange(false);
                  onAddPortal();
                }}
              >
                <PlusIcon className="size-4" />
                Add Source
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-base font-medium text-foreground">
                AI Provider
              </span>
              <div className="flex flex-col gap-4">
                  {overrideEnv ? (
                    <>
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="ai-base-url">Base URL</Label>
                          <Label
                            htmlFor="override-env"
                            className="inline-flex items-center gap-2 text-xs text-muted-foreground"
                          >
                            <span>
                              Override <span className="font-mono">.env</span>
                            </span>
                            <Switch
                              id="override-env"
                              checked={overrideEnv}
                              onCheckedChange={setOverrideEnv}
                            />
                          </Label>
                        </div>
                        <Input
                          id="ai-base-url"
                          type="url"
                          placeholder="https://api.openai.com/v1"
                          value={customBaseUrl}
                          onChange={(event) =>
                            setCustomBaseUrl(event.target.value)
                          }
                        />
                      </div>

                      <div className="flex flex-col gap-2.5">
                        <Label htmlFor="ai-api-key">API Key</Label>
                        <Input
                          id="ai-api-key"
                          type="password"
                          placeholder="sk-..."
                          value={customApiKey}
                          onChange={(event) =>
                            setCustomApiKey(event.target.value)
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <Label>Base URL</Label>
                          <Label
                            htmlFor="override-env"
                            className="inline-flex items-center gap-2 text-xs text-muted-foreground"
                          >
                            <span>
                              Override <span className="font-mono">.env</span>
                            </span>
                            <Switch
                              id="override-env"
                              checked={overrideEnv}
                              onCheckedChange={setOverrideEnv}
                            />
                          </Label>
                        </div>
                        <div className="flex h-8 items-center text-sm text-muted-foreground">
                          {envBaseUrl ?? "Not configured"}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2.5">
                        <Label>API Key</Label>
                        <div className="flex h-8 items-center text-sm text-muted-foreground">
                          {envApiKey ? "Using key from .env" : "Not configured"}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex flex-col gap-2.5">
                    <Label>Model</Label>
                    {fetchingModels ? (
                      <div className="flex h-8 items-center gap-2 text-sm text-muted-foreground">
                        <Loader2Icon className="size-3.5 animate-spin" />
                        Fetching models...
                      </div>
                    ) : models.length === 0 ? (
                      <div className="flex h-8 items-center text-sm text-muted-foreground">
                        {overrideEnv
                          ? "Enter base URL and API key first"
                          : "Waiting for env configuration..."}
                      </div>
                    ) : (
                      <Combobox
                        items={models}
                        value={normalizedModel}
                        onValueChange={(value) =>
                          setModel((value as string | null) ?? "")
                        }
                      >
                        <ComboboxInput
                          placeholder="Select a model..."
                          showTrigger
                          showClear
                        />
                        <ComboboxContent container={contentRef}>
                          <ComboboxList>
                            {(item: string) => (
                              <ComboboxItem key={item} value={item}>
                                {item}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                          <ComboboxEmpty>No models match your search</ComboboxEmpty>
                        </ComboboxContent>
                      </Combobox>
                    )}
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <Label>Reasoning Effort</Label>
                    <Tabs
                      value={reasoningEffort}
                      onValueChange={(value) =>
                        setReasoningEffort(
                          value as "none" | "low" | "medium" | "high" | "max"
                        )
                      }
                    >
                      <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="none">None</TabsTrigger>
                        <TabsTrigger value="low">Low</TabsTrigger>
                        <TabsTrigger value="medium">Medium</TabsTrigger>
                        <TabsTrigger value="high">High</TabsTrigger>
                        <TabsTrigger value="max">Max</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveAiSettings}
                    disabled={!canSaveAiSettings}
                    className="w-full"
                  >
                    <CheckIcon className="size-3.5" />
                    Save AI Settings
                  </Button>
              </div>
            </div>

            {/* EPG Status & Action */}
            <div className="flex flex-col gap-2">
              <span className="text-base font-medium text-foreground">
                EPG Data Status
              </span>
              <div className="rounded-lg border bg-muted/10 p-3 text-xs flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last updated:</span>
                  <span className="font-medium">{formatLastFetched(epgManifest?.lastFetchedAt ?? null)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Countries:</span>
                  <span className="font-medium">{epgManifest?.countries.length ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total channels:</span>
                  <span className="font-medium">{totalChannels.toLocaleString()}</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRefetch}
                disabled={isRefetching}
                className="mt-1 w-full flex items-center justify-center gap-1.5 cursor-pointer rounded-md"
              >
                {isRefetching ? (
                  <>
                    <Loader2Icon className="size-3.5 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCwIcon className="size-3.5" />
                    Refresh EPG
                  </>
                )}
              </Button>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter showCloseButton className="shrink-0" />
      </DialogContent>
    </Dialog>
  );
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
