"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { ChevronLeftIcon } from "lucide-react"

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { getChannelKey } from "@/lib/tv-channels"
import { ChannelLogo } from "@/components/tv/channel-logo"
import { PrimaryMeshGradientBackdrop } from "@/components/mesh-gradient-backdrop"
import { useLogoStyle } from "@/lib/logo-analysis"
import { LivePlayer } from "@/components/tv/live-player"
import { ProgrammeGuide } from "@/components/tv/programme-guide"
import {
  ChannelEpgProvider,
  useChannelEpg,
} from "@/components/tv/channel-epg-provider"
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
    channelLogoUrl,
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

  /**
   * The channel's artwork, not the chosen stream's.
   *
   * One resolution for the whole app — see channelLogoUrl in the provider —
   * so this and the row in the list cannot disagree, and neither follows the
   * chosen source. A portal ships its own artwork for its copy, so resolving
   * from whichever stream is in hand made the logo above the player change
   * every time someone switched source, as though they had changed channel.
   * Which portal is playing is the sources drawer's subject, and that is where
   * each stream still wears its own.
   */
  const logoUrl = channelLogoUrl(defaultChannel ?? channel)

  return (
    // The guide wraps the header too, not just the player and the listings
    // below it. What is on now is the header's subject as much as theirs, and
    // one provider means all three read the same fetch.
    <ChannelEpgProvider channel={channel}>
      <div className="bg-background relative flex h-full flex-col overflow-hidden min-[940px]:rounded-2xl">
        <ChannelMeshBackdrop logoUrl={logoUrl} />
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
            {/* Leading on the spans themselves, not on this column. A
                text-lg utility sets its own line-height, and an element that
                declares one never inherits one — so leading-tight up here was
                doing nothing, and each line kept a default box with three to
                five points of empty air packed above and below its glyphs.
                That air was the gap. With it gone, gap-0.5 is the whole
                distance between the two lines. */}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-lg leading-tight font-semibold">
                {channel.name || "Live stream"}
              </span>
              <NowPlayingTitle />
            </div>
          </motion.button>
        </div>
        <ScrollArea
          className="touch-hide-scrollbar relative z-10 min-h-0 flex-1 px-4 pb-4"
          viewportClassName="focus-visible:ring-0 focus-visible:outline-none"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pt-2">
            {/* A source tap keeps the channel slug but changes the stream. Key
                the player by the actual stream so an old resolve error cannot
                mask the newly-selected source while it starts. */}
            <LivePlayer
              key={getChannelKey(channel)}
              channel={channel}
              logoUrl={logoUrl}
            />
            <ProgrammeGuide />
          </div>
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
    </ChannelEpgProvider>
  )
}

/**
 * What is on now, under the channel's name.
 *
 * The programme rather than the category, because the guide has no category for
 * a channel — only for a programme — and a portal's category is its filing of
 * one stream, which changed under the viewer every time they switched source.
 * This is a fact about the channel: the same line whichever portal is carrying
 * it, and the same line the row in the list shows.
 *
 * Nothing at all when the guide has no listing, which is most channels on most
 * portals. An empty line is quieter than a placeholder explaining itself.
 */
function NowPlayingTitle() {
  const { currentProgramme } = useChannelEpg()

  if (!currentProgramme?.title) return null

  // The row's treatment, figure for figure: 13 points, medium, and dimmed
  // against a name at full strength. It is the same line saying the same thing
  // a few pixels from the list that also says it, so it reads as the same fact
  // rather than as two — and muted-foreground at regular weight had it reading
  // as a caption under the name instead.
  return (
    <span className="text-foreground/80 truncate text-[13px] leading-tight font-medium">
      {currentProgramme.title}
    </span>
  )
}

/**
 * The channel's colour, behind the top of the player panel.
 *
 * The band the tiles page wears, to the figure: the same height, the same fade
 * to nothing at 40%, and the same backdrop underneath it. It is also what the
 * panel already shows when no channel is selected, so opening one changes the
 * colour rather than introducing a decoration.
 *
 * The colour is the logo's, from the pass that tints the tile a few points
 * away — one channel, one colour. A logo the pass found nothing in leaves this
 * undefined and the backdrop keeps the app's green, which is what the empty
 * panel shows too.
 */
function ChannelMeshBackdrop({ logoUrl }: { logoUrl: string }) {
  // The dominant colour rather than the tile's. The tile's is a verdict about
  // what a mark can be read against — most logos are told to keep the base
  // tile, and a white one is given no colour at all — which leaves the
  // channels with the plainest colours of all throwing no glow. What a wash
  // behind a header wants is just what colour the logo mostly is.
  const { accent, color } = useLogoStyle(logoUrl)

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[clamp(26rem,52vw,40rem)]"
      style={{
        // Full strength for the top third, then gone by the bottom. Taller
        // than the tiles page's band and fading sooner within itself, because
        // here the useful part is the strip above the picture.
        maskImage:
          "linear-gradient(to bottom, #000 0%, #000 30%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, #000 0%, #000 30%, transparent 100%)",
      }}
    >
      <PrimaryMeshGradientBackdrop color={accent ?? color} intensity="vivid" />
    </div>
  )
}
