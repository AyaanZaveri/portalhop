"use client";

import * as React from "react";
import { GlobeIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTheme } from "next-themes";
import { loadPortalSettings, savePortalSettings } from "@/lib/portal-settings";

export default function GeneralSettingsPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const epgLogoUrl = isDark
    ? "https://img.logo.dev/iptv-epg.org?token=live_6a1a28fd-6420-4492-aeb0-b297461d9de2&size=128&retina=true&format=png"
    : "https://www.google.com/s2/favicons?sz=64&domain=iptv-epg.org";

  const [logoSource, setLogoSource] = React.useState<"provider" | "epg">(() => {
    const saved = loadPortalSettings();
    return saved.logoSource === "epg" || saved.logoSource === "provider"
      ? saved.logoSource
      : "provider";
  });
  const [useProxy, setUseProxy] = React.useState(
    () => loadPortalSettings().useProxy === true
  );

  function handleLogoSourceChange(source: "provider" | "epg") {
    setLogoSource(source);
    savePortalSettings({ logoSource: source, useProxy });
  }

  function handleUseProxyChange(nextUseProxy: boolean) {
    setUseProxy(nextUseProxy);
    savePortalSettings({ logoSource, useProxy: nextUseProxy });
  }

  return (
    <div className="flex flex-col gap-6">
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
          <TabsList className="grid w-full max-w-md grid-cols-2">
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

      <div className="flex w-full items-center justify-between gap-4 rounded-md border bg-muted/10 p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
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
    </div>
  );
}
