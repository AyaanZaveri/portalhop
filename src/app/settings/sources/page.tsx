"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CopyIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  TvIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { SavedSourceRecord } from "@/lib/source-types";
import { readOpenedPortalIds, persistOpenedPortalIds } from "@/lib/opened-portals";

type SavedPortalRecord = SavedSourceRecord;

export default function SourcesSettingsPage() {
  const router = useRouter();
  const [savedPortals, setSavedPortals] = React.useState<SavedPortalRecord[]>(
    []
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [activePortalIds, setActivePortalIds] = React.useState<number[]>(
    () => readOpenedPortalIds()
  );
  const [refetchingPortalId, setRefetchingPortalId] = React.useState<
    number | null
  >(null);
  const [copyingPortalId, setCopyingPortalId] = React.useState<number | null>(
    null
  );

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
    setActivePortalIds((current) => {
      const next = checked
        ? [...current, portal.id]
        : current.filter((id) => id !== portal.id);

      persistOpenedPortalIds(next);
      return next;
    });
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
    <div className="flex flex-col gap-2">
      <span className="text-base font-medium text-foreground">Sources</span>

      <div className="flex flex-col gap-1">
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
                {portal.sourceType === "stalker" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={
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
                  disabled={refetchingPortalId === portal.id}
                  onClick={() => handleRefetchPortal(portal)}
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
            {isLoading
              ? "Loading saved sources."
              : "Successful connections can be saved here."}
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md"
        onClick={() => router.push("/?addSource=1")}
      >
        <PlusIcon className="size-4" />
        Add Source
      </Button>
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
