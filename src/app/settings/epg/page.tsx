"use client";

import * as React from "react";
import { CalendarIcon, GlobeIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "next-themes";
import type { EpgManifest } from "@/lib/epg-store";
import { useUserSettings } from "@/hooks/use-user-settings";
import { SettingsHeader } from "@/components/settings-header";

export default function EpgAndLogosSettingsPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const epgLogoUrl = isDark
    ? "https://img.logo.dev/iptv-epg.org?token=live_6a1a28fd-6420-4492-aeb0-b297461d9de2&size=128&retina=true&format=png"
    : "https://www.google.com/s2/favicons?sz=64&domain=iptv-epg.org";

  const { settings, updateSettings } = useUserSettings();
  const logoSource = settings.logoSource;
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

  function handleLogoSourceChange(source: "provider" | "epg") {
    updateSettings({ logoSource: source });
  }

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

  function formatLastFetchedParts(timestamp: number | null) {
    if (!timestamp) return { date: "Never", time: null as string | null };
    const value = new Date(timestamp);
    return {
      date: value.toLocaleDateString(undefined, { dateStyle: "medium" }),
      time: value.toLocaleTimeString(undefined, { timeStyle: "short" }),
    };
  }

  const lastFetched = formatLastFetchedParts(epgManifest?.lastFetchedAt ?? null);

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader icon={CalendarIcon} title="EPG & Logos" />

      <div className="flex flex-col gap-1.5">
        <span className="text-base font-medium text-foreground">
          EPG Source
        </span>
        <Tabs
          value={logoSource}
          onValueChange={(value) =>
            handleLogoSourceChange(value as "provider" | "epg")
          }
        >
          <TabsList className="grid h-auto w-full grid-cols-2 items-stretch gap-1 p-1 group-data-horizontal/tabs:h-auto">
            <TabsTrigger
              value="provider"
              className="h-auto min-w-0 flex-col items-start justify-center gap-1 px-2.5 py-2 text-left cursor-pointer active:scale-[0.985]"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <GlobeIcon className="size-3.5 shrink-0" />
                Portal
              </span>
              <span className="w-full truncate text-xs font-normal text-muted-foreground">
                Bundled with your portal
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="epg"
              className="h-auto min-w-0 flex-col items-start justify-center gap-1 px-2.5 py-2 text-left cursor-pointer active:scale-[0.985]"
            >
              <span className="flex items-center gap-1.5 font-medium">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={epgLogoUrl}
                  alt=""
                  className="size-3.5 shrink-0 rounded-xs"
                />
                iptv-epg.org
              </span>
              <span className="w-full truncate text-xs font-normal text-muted-foreground">
                A dedicated EPG service
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-base font-medium text-foreground">
          EPG Data Status
        </span>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-4">
            <span className="text-xs text-muted-foreground">
              Last updated
            </span>
            <span className="font-mono text-2xl font-medium tracking-tight text-foreground">
              {lastFetched.date}
            </span>
            {lastFetched.time ? (
              <span className="font-mono text-sm tracking-tight text-primary brightness-75 dark:brightness-100">
                @ {lastFetched.time}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-4">
            <span className="text-xs text-muted-foreground">Countries</span>
            <span className="font-mono text-2xl font-medium tracking-tight text-foreground">
              {epgManifest?.countries.length ?? 0}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-4">
            <span className="text-xs text-muted-foreground">
              Total channels
            </span>
            <span className="font-mono text-2xl font-medium tracking-tight text-foreground">
              {totalChannels.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleRefetch}
            disabled={isRefetching}
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
    </div>
  );
}
