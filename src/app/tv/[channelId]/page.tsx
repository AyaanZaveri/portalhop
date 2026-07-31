"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { ChevronLeftIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { getChannelLogoUrl } from "@/lib/tv-channels"
import { LivePlayer } from "@/components/tv/live-player"
import { ProgrammeGuide } from "@/components/tv/programme-guide"
import { ChannelEpgProvider } from "@/components/tv/channel-epg-provider"
import { useTv } from "@/components/tv/tv-provider"

export default function ChannelPage() {
  const params = useParams<{ channelId: string }>()
  const channelId = params?.channelId ?? ""
  const router = useRouter()
  const {
    channelIndex,
    isLoadingPortals,
    iptvOrgLoading,
    browserChannels,
    epgChannels,
    customEpgChannels,
    useImageProxy,
  } = useTv()
  const prefersReducedMotion = useReducedMotion()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 939px)")
    const updateLayout = () => {
      setIsMobile(mediaQuery.matches)
      if (!mediaQuery.matches) setDetailsOpen(false)
    }

    updateLayout()
    mediaQuery.addEventListener("change", updateLayout)
    return () => mediaQuery.removeEventListener("change", updateLayout)
  }, [])

  const channel = channelIndex.get(channelId)
  const isLoading = isLoadingPortals || iptvOrgLoading

  // Deep link / stale id: once channels have loaded, an unknown id goes home.
  useEffect(() => {
    if (!isLoading && browserChannels.length > 0 && !channel) {
      router.replace("/tv")
    }
  }, [isLoading, browserChannels.length, channel, router])

  if (!channel) {
    return (
      <div className="bg-background flex h-full items-center justify-center min-[940px]:rounded-2xl">
        <Spinner />
      </div>
    )
  }

  const logoUrl = getChannelLogoUrl(
    channel,
    channel.portalSource,
    epgChannels,
    customEpgChannels,
    useImageProxy,
  )

  return (
    <div className="bg-background relative flex h-full flex-col overflow-hidden min-[940px]:rounded-2xl">
      <div className="relative z-10 flex min-h-16 items-center gap-2 px-4 pt-4 pb-3 min-[940px]:pr-[22rem]">
        <Link
          href="/tv"
          aria-label="Back to channels"
          className="text-muted-foreground hover:text-foreground hover:bg-accent -ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors min-[940px]:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
        <motion.button
          type="button"
          key={channelId}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg pr-28 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none min-[940px]:cursor-default min-[940px]:pr-0"
          onClick={() => {
            if (isMobile) setDetailsOpen(true)
          }}
          aria-label={
            isMobile ? `Show details for ${channel.name || "Live stream"}` : undefined
          }
          tabIndex={isMobile ? 0 : -1}
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        >
          {logoUrl ? (
            <div className="border-border/60 flex size-11 shrink-0 items-center justify-center overflow-clip rounded-lg border bg-zinc-900 p-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- Channel logos can come from arbitrary provider or EPG hosts. */}
              <img
                src={logoUrl}
                alt=""
                className="size-full rounded-[6px] object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-lg font-semibold">
              {channel.name || "Live stream"}
            </p>
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <span className="truncate">
                {channel.genre || "Uncategorized"}
              </span>
              {channel.portalSource?.name ? (
                <Badge variant="outline" className="h-5">
                  {channel.portalSource.name}
                </Badge>
              ) : null}
            </div>
          </div>
        </motion.button>
      </div>
      <ScrollArea
        className="min-h-0 flex-1 px-4 pb-4"
        viewportClassName="focus-visible:ring-0 focus-visible:outline-none"
      >
        <ChannelEpgProvider channel={channel}>
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pt-2">
            <LivePlayer key={channelId} channel={channel} />
            <ProgrammeGuide />
          </div>
        </ChannelEpgProvider>
      </ScrollArea>
      {isMobile ? (
        <Drawer open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl dark:border backdrop-blur-md [--drawer-inset:0.5rem] after:hidden">
            <div className="flex items-center gap-3 p-4 pb-5">
              {logoUrl ? (
                <div className="border-border/60 flex size-12 shrink-0 items-center justify-center overflow-clip rounded-lg border bg-zinc-900 p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Channel logos can come from arbitrary provider or EPG hosts. */}
                  <img
                    src={logoUrl}
                    alt=""
                    className="size-full rounded-[6px] object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1 pt-0.5 text-left">
                <DrawerTitle className="text-left leading-tight">
                  {channel.name || "Live stream"}
                </DrawerTitle>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <DrawerDescription className="min-w-0 truncate text-left">
                    {channel.genre || "Uncategorized"}
                  </DrawerDescription>
                  {channel.portalSource?.name ? (
                    <Badge variant="outline" className="h-5 shrink-0">
                      {channel.portalSource.name}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  )
}
