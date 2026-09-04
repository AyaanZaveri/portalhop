"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { motion, useReducedMotion } from "motion/react"
import { ChevronLeftIcon } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
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
  channelHref,
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
    channelStreams,
  } = useTv()
  const prefersReducedMotion = useReducedMotion()
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
      <div className="bg-background h-full min-[940px]:rounded-2xl" />
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

  /**
   * When a source will not play, move down the list rather than sit there.
   *
   * The order is the channel's own -- the same one the sources drawer shows and
   * the same one that decided which stream opened -- so this is the list being
   * followed to its next entry, not a search for something that works.
   *
   * Only streams that can be addressed. A stream is pinned for this view by its
   * saved-channel id, and one without a row of its own -- the built-in iptv-org
   * catalogue -- cannot be pinned, so moving to it would land back on whatever
   * the channel opens by default and fail over again.
   *
   * replace, not push: a source that did not play is not a place to go back to.
   *
   * Written straight to history for the same reason the sources drawer is --
   * this is the same act, moving between streams of one channel, and it runs
   * while a stream is failing and the catalogue is being re-grouped. A URL that
   * waits on that render is a URL that can be dropped. See selectSource.
   */
  const streams = channelStreams(defaultChannel ?? channel)
  const currentIndex = streams.findIndex(
    (stream) => getChannelKey(stream) === getChannelKey(channel),
  )
  const nextStream =
    currentIndex >= 0
      ? streams
          .slice(currentIndex + 1)
          .find((stream) => stream.savedChannelId != null)
      : undefined

  // Not memoized, and it must not be: this sits below an early return, where a
  // hook cannot go. The player holds it in a ref rather than in a dependency
  // array, so a new function every render costs nothing.
  const onUnplayable = (reason: string) => {
    if (!nextStream) {
      toast.error(reason)
      return
    }

    toast(
      `${channel.portalSource?.name ?? "That source"} didn't play. Trying ${nextStream.portalSource?.name ?? "the next source"}.`,
    )
    window.history.replaceState(
      null,
      "",
      channelHref(channelId, nextStream.savedChannelId),
    )
  }

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
          <ChannelIdentity
            key={channelId}
            channelName={channel.name}
            logoUrl={logoUrl}
            prefersReducedMotion={prefersReducedMotion}
            className="hidden min-[940px]:flex"
          />
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
              onUnplayable={onUnplayable}
              hasNextSource={Boolean(nextStream)}
              onChooseSource={() => {
                window.dispatchEvent(new Event("portalhop:open-sources"))
              }}
            />
            {/* On phones, the picture establishes the destination before its
                metadata. Keeping this in the document flow gives the name a
                stable, readable place without competing with the source
                controls in the compact top bar. */}
            <ChannelIdentity
              key={channelId}
              channelName={channel.name}
              logoUrl={logoUrl}
              prefersReducedMotion={prefersReducedMotion}
              className="min-[940px]:hidden"
            />
            <ProgrammeGuide className="mt-2 min-[940px]:mt-4" />
          </div>
        </ScrollArea>
      </div>
    </ChannelEpgProvider>
  )
}

function ChannelIdentity({
  channelName,
  className,
  logoUrl,
  prefersReducedMotion,
}: {
  channelName: string
  className?: string
  logoUrl: string
  prefersReducedMotion: boolean | null
}) {
  return (
    <motion.div
      className={`flex min-w-0 flex-1 items-center gap-3 ${className ?? ""}`}
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
    >
      <ChannelLogo url={logoUrl} />
      {/* Leading belongs to the text, not its column: text-lg declares its
          own line-height, so a parent leading utility cannot tighten it. */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-lg leading-tight font-semibold">
          {channelName || "Live stream"}
        </span>
        <NowPlayingTitle />
      </div>
    </motion.div>
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
