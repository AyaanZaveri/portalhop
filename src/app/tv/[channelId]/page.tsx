"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { ChevronLeftIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { getChannelLogoUrl } from "@/lib/tv-channels"
import { LivePlayer } from "@/components/tv/live-player"
import { ProgrammeGuide } from "@/components/tv/programme-guide"
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
      <div className="bg-background flex h-full items-center justify-center rounded-2xl">
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
    <div className="bg-background relative flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="relative z-10 flex min-h-16 items-center gap-2 px-4 pt-4 pb-3 min-[940px]:pr-[22rem]">
        <Link
          href="/tv"
          aria-label="Back to channels"
          className="text-muted-foreground hover:text-foreground hover:bg-accent -ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors min-[940px]:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
        <motion.div
          key={channelId}
          className="flex min-w-0 items-center gap-3"
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
        </motion.div>
      </div>
      <ScrollArea
        className="min-h-0 flex-1 px-4 pb-4"
        viewportClassName="focus-visible:ring-0 focus-visible:outline-none"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pt-2">
          <LivePlayer key={channelId} channel={channel} />
          <ProgrammeGuide channel={channel} />
        </div>
      </ScrollArea>
    </div>
  )
}
