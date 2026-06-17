"use client";

import * as React from "react";
import { CircleCheck, SettingsIcon, Loader2Icon, PlusIcon, RefreshCwIcon, TvIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EpgManifest } from "@/lib/epg-store";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "next-themes";
import type { PortalRequest } from "@/lib/stalker-types";

interface SettingsDialogProps {
  logoSource: "provider" | "epg";
  onLogoSourceChange: (source: "provider" | "epg") => void;
  epgManifest: EpgManifest | null;
  onRefetchComplete: () => Promise<void>;
  savedPortals: SavedPortalRecord[];
  activePortalId: number | null;
  isLoadingPortals: boolean;
  loadingPortalId: number | null;
  refetchingPortalId: number | null;
  onAddPortal: () => void;
  onLoadPortal: (portal: SavedPortalRecord) => void | Promise<void>;
  onRefetchPortal: (portal: SavedPortalRecord) => void | Promise<void>;
}

type SavedPortalRecord = PortalRequest & {
  id: number;
  name: string;
  endpoint?: string | null;
  channelCount: number;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
};

export function SettingsDialog({
  logoSource,
  onLogoSourceChange,
  epgManifest,
  onRefetchComplete,
  savedPortals,
  activePortalId,
  isLoadingPortals,
  loadingPortalId,
  refetchingPortalId,
  onAddPortal,
  onLoadPortal,
  onRefetchPortal,
}: SettingsDialogProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isRefetching, setIsRefetching] = React.useState(false);
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
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 cursor-pointer rounded-md text-muted-foreground hover:text-foreground"
        onClick={() => setIsOpen(true)}
        aria-label="Settings"
      >
        <SettingsIcon className="size-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Configure Portal Hop preferences and EPG data synchronization.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Logo Source Preference */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                Logo Source
              </span>
              <Tabs
                value={logoSource}
                onValueChange={(value) => onLogoSourceChange(value as "provider" | "epg")}
              >
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="provider">
                    Provider Logos
                  </TabsTrigger>
                  <TabsTrigger value="epg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={epgLogoUrl}
                      alt=""
                      className="size-3.5 shrink-0 rounded-xs"
                    />
                    EPG Logos
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">
                Portals
              </span>
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {savedPortals.length ? (
                  savedPortals.map((portal) => {
                    const isActive = activePortalId === portal.id;

                    return (
                      <div
                        key={portal.id}
                        className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                      >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md">
                        {isActive ? (
                          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                            <CircleCheck className="size-4 text-primary brightness-75 dark:brightness-100" />
                          </span>
                        ) : (
                          <span className="flex size-8 items-center justify-center rounded-md bg-muted/50">
                            <TvIcon className="size-4 text-muted-foreground" />
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                        onClick={() => onLoadPortal(portal)}
                      >
                        <span className="w-full truncate text-sm font-medium">
                          {portal.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {portal.channelCount.toLocaleString()} channels
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={
                          loadingPortalId === portal.id ||
                          refetchingPortalId === portal.id
                        }
                        onClick={() => onRefetchPortal(portal)}
                        aria-label="Refetch portal"
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
                      ? "Loading saved portals."
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
                  setIsOpen(false);
                  onAddPortal();
                }}
              >
                <PlusIcon className="size-4" />
                Add Portal
              </Button>
            </div>

            {/* EPG Status & Action */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">
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

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </>
  );
}
