"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { ChevronLeftIcon } from "lucide-react"

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { getChannelKey, getChannelLogoUrl } from "@/lib/tv-channels"
import { ChannelLogo } from "@/components/tv/channel-logo"
import { LivePlayer } from "@/components/tv/live-player"
import { ProgrammeGuide } from "@/components/tv/programme-guide"
import { ChannelEpgProvider } from "@/components/tv/channel-epg-provider"
import { useTv } from "@/components/tv/tv-provider"
import {
  useActiveChannelSlug,
  useActiveChannelSourceId,
} from "@/hooks/use-active-channel"

export function ChannelDetail() {
  const channelId = useActiveChannelSlug() ?? ""
  const sourceId = useActiveChannelSourceId()
  const router = useRouter()
  const {
    channelIndex,
    isLoadingPortals,
    iptvOrgLoading,
    browserChannels,
    channelSlug,
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

  const defaultChannel = channelIndex.get(channelId)
  // A source picked in the drawer wins for this URL only. Confirm it still
  // belongs to the requested channel so an edited URL cannot jump across
  // channels merely by guessing a saved row id.
  const selectedChannel = sourceId
    ? browserChannels.find(
        (entry) =>
          entry.savedChannelId === sourceId && channelSlug(entry) === channelId,
      )
    : undefined
  const channel = selectedChannel ?? defaultChannel
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
          className="focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 rounded-lg pr-52 text-left focus-visible:ring-3 focus-visible:outline-none min-[940px]:cursor-default min-[940px]:pr-0"
          onClick={() => {
            if (isMobile) setDetailsOpen(true)
          }}
          aria-label={
            isMobile
              ? `Show details for ${channel.name || "Live stream"}`
              : undefined
          }
          tabIndex={isMobile ? 0 : -1}
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        >
          <ChannelLogo url={logoUrl} />
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-lg font-semibold">
              {channel.name || "Live stream"}
            </p>
          </div>
        </motion.button>
      </div>
      <ScrollArea
        className="touch-hide-scrollbar min-h-0 flex-1 px-4 pb-4"
        viewportClassName="focus-visible:ring-0 focus-visible:outline-none"
      >
        <ChannelEpgProvider channel={channel}>
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pt-2">
            {/* A source tap keeps the channel slug but changes the stream. Key
                the player by the actual stream so an old resolve error cannot
                mask the newly-selected source while it starts. */}
            <LivePlayer key={getChannelKey(channel)} channel={channel} />
            <ProgrammeGuide />
          </div>
        </ChannelEpgProvider>
      </ScrollArea>
      {isMobile ? (
        <Drawer open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md [--drawer-inset:0.5rem] after:hidden dark:border">
            <div className="flex items-center gap-3 p-4 pb-5">
              <ChannelLogo url={logoUrl} />
              <div className="min-w-0 flex-1 pt-0.5 text-left">
                <DrawerTitle className="text-left leading-tight">
                  {channel.name || "Live stream"}
                </DrawerTitle>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  )
}
