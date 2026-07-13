"use client";

import * as React from "react";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EpgManifest } from "@/lib/epg-store";

export default function EpgStatusSettingsPage() {
  const [epgManifest, setEpgManifest] = React.useState<EpgManifest | null>(
    null
  );
  const [isRefetching, setIsRefetching] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const res = await fetch("/api/epg");
        if (!res.ok) return;
        const manifest: EpgManifest = await res.json();
        if (isMounted) setEpgManifest(manifest);
      } catch (err) {
        console.error("Failed to load EPG manifest:", err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleRefetch() {
    setIsRefetching(true);
    const toastId = toast.loading("Refetching EPG data from iptv-epg.org...");
    try {
      const res = await fetch("/api/epg", { method: "POST" });
      if (!res.ok) throw new Error("Refetch failed");
      const manifest: EpgManifest = await res.json();
      setEpgManifest(manifest);
      toast.success("EPG data updated successfully", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Failed to refetch EPG data", { id: toastId });
    } finally {
      setIsRefetching(false);
    }
  }

  const totalChannels =
    epgManifest?.countries.reduce((sum, c) => sum + c.count, 0) ?? 0;

  function formatLastFetched(timestamp: number | null) {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <div className="flex max-w-lg flex-col gap-2">
      <span className="text-base font-medium text-foreground">
        EPG Data Status
      </span>
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/10 p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last updated:</span>
          <span className="font-medium">
            {formatLastFetched(epgManifest?.lastFetchedAt ?? null)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Countries:</span>
          <span className="font-medium">
            {epgManifest?.countries.length ?? 0}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total channels:</span>
          <span className="font-medium">
            {totalChannels.toLocaleString()}
          </span>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleRefetch}
        disabled={isRefetching}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md"
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
  );
}
