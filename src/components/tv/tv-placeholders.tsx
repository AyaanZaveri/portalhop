"use client"

import type { ReactNode } from "react"
import {
  FolderHeartIcon,
  LayoutGridIcon,
  SearchIcon,
  ShapesIcon,
  StarIcon,
  TvIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Skeleton } from "@/components/ui/skeleton"
import { chipButtonProps, chipLabelCollapse } from "@/components/tv/chip-button"
import { PortalHopWordmark } from "@/components/portal-hop-wordmark"
import { PrimaryMeshGradientBackdrop } from "@/components/mesh-gradient-backdrop"
import { useHydratedLayout } from "@/hooks/use-hydrated-layout"
import {
  TV_MOBILE_LAYOUT_QUERY,
  useMediaQuery,
} from "@/hooks/use-media-query"
import type { BrowseFilter } from "@/components/tv/tv-provider"

/**
 * The one channel-row skeleton. Rendered both by the initial page placeholder
 * and by the in-list loading state so the two never drift apart. Horizontal
 * padding comes from the scroll container, matching a real channel row.
 */
export function ChannelRowSkeletons({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-1.5 pt-[3px]">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex h-[78px] items-center gap-3 rounded-xl pr-1 pl-2"
        >
          {/* Same 66×44 3:2 tile as ChannelLogo — a square skeleton makes
              every real row visibly jump sideways when artwork resolves. */}
          <Skeleton className="h-11 w-[66px] shrink-0 rounded-[10px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {/* Keep this side identical to the non-EPG row: category first,
                then the source and XMLTV badges. EPG replaces it only after
                its programme data has arrived. */}
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-4 w-10 rounded" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function EmptyPlayerPanel({
  showBackdrop = true,
}: {
  showBackdrop?: boolean
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden p-4">
      {showBackdrop ? <PrimaryMeshGradientBackdrop /> : null}
      <div className="text-muted-foreground relative z-10 flex flex-col items-center justify-center gap-3 text-center">
        <TvIcon className="size-8" />
        <p className="text-sm">No channel selected.</p>
      </div>
    </div>
  )
}

export function NoPortalsSelected({
  signedIn,
  onEnableFreeChannels,
}: {
  signedIn: boolean
  onEnableFreeChannels?: () => void
}) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden text-center">
      <PrimaryMeshGradientBackdrop />
      <div className="relative z-10 flex flex-col items-center justify-center gap-6 px-4">
        <PortalHopWordmark />
        <div className="flex max-w-sm flex-col gap-1.5">
          <p className="font-medium">Nothing to browse yet</p>
          <p className="text-muted-foreground text-sm">
            {signedIn
              ? "Add a portal, or turn the free IPTV-org channels back on to start browsing."
              : "Sign in to load your portals, or turn on the free IPTV-org channels to start browsing."}
          </p>
        </div>
        {onEnableFreeChannels ? (
          <Button variant="outline" size="sm" onClick={onEnableFreeChannels}>
            <TvIcon className="mt-[-0.08rem] mr-0.5 size-3.5" />
            Show public channels
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function ChannelListSkeleton({
  headerControls,
  browseFilter = { type: "all" },
}: {
  headerControls?: ReactNode
  browseFilter?: BrowseFilter
}) {
  return (
    <div className="bg-background flex h-full min-w-0 flex-col overflow-hidden min-[940px]:min-w-80 min-[940px]:rounded-2xl min-[940px]:bg-card">
      {/* tv-list-header, like the real list's header: the packaged app trims
          the top padding there, and without the same class here the whole
          header dropped 12px the moment channels finished loading. */}
      <div className="tv-list-header flex flex-col gap-3 p-5 pb-2 min-[940px]:p-4 min-[940px]:pb-2">
        <div className="mb-1 flex items-center justify-between gap-3">
          <PortalHopWordmark />
          {headerControls ? (
            <div className="-mr-1 flex shrink-0 items-center gap-1 min-[940px]:mr-0">
              {headerControls}
            </div>
          ) : null}
        </div>
        <InputGroup>
          <InputGroupInput placeholder="Search channels" />
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
        <div className="@container flex items-center gap-1.5" aria-hidden="true">
          <Button
            {...chipButtonProps(browseFilter.type === "favorites")}
            tabIndex={-1}
          >
            <StarIcon className="size-3.5" />
            Favorites
          </Button>
          <Button {...chipButtonProps(browseFilter.type === "all")} tabIndex={-1}>
            <LayoutGridIcon className="size-3.5" />
            All
          </Button>
          <Button
            {...chipButtonProps(browseFilter.type === "category", {
              collapsible: true,
            })}
            tabIndex={-1}
          >
            <ShapesIcon className="size-3.5" />
            <span className={chipLabelCollapse}>Categories</span>
          </Button>
          <Button
            {...chipButtonProps(browseFilter.type === "favoriteGroup", {
              iconOnly: true,
            })}
            tabIndex={-1}
          >
            <FolderHeartIcon className="size-3.5" />
            <span className="sr-only">Groups</span>
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-2">
        <ChannelRowSkeletons count={14} />
      </div>
    </div>
  )
}

function PlayerSkeleton() {
  return (
    <div className="bg-background relative flex h-full flex-col overflow-hidden min-[940px]:rounded-2xl">
      <PrimaryMeshGradientBackdrop />
      <div className="relative z-10 flex min-h-16 items-center justify-between gap-3 px-4 pt-4 pb-3 min-[940px]:pr-[22rem]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 flex-col">
            <p className="font-semibold">Select a channel</p>
            <p className="text-muted-foreground text-sm">
              Pick a channel from the sidebar to start playback.
            </p>
          </div>
        </div>
      </div>
      <EmptyPlayerPanel showBackdrop={false} />
    </div>
  )
}

export function LoadingShell({
  headerControls,
  browseFilter,
}: {
  headerControls?: ReactNode
  browseFilter?: BrowseFilter
}) {
  const isMobileLayout = useMediaQuery(TV_MOBILE_LAYOUT_QUERY, true)
  const isReady = useHydratedLayout()

  // Mobile lands on the channel list, so its loading state is just the list.
  if (isReady && isMobileLayout) {
    return (
      <div className="bg-background h-full overflow-hidden">
        <ChannelListSkeleton headerControls={headerControls} browseFilter={browseFilter} />
      </div>
    )
  }

  return (
    <>
      <div className="bg-background h-full overflow-hidden min-[940px]:hidden">
        <ChannelListSkeleton headerControls={headerControls} browseFilter={browseFilter} />
      </div>
      <div className="bg-muted/30 hidden h-full w-full gap-1.5 overflow-hidden p-3 min-[940px]:flex">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full gap-1.5"
          resizeTargetMinimumSize={{ coarse: 44, fine: 12 }}
        >
          <ResizablePanel
            key="channels"
            defaultSize="360px"
            minSize="320px"
            maxSize="520px"
          >
            <ChannelListSkeleton browseFilter={browseFilter} />
          </ResizablePanel>
          <ResizableHandle className="bg-transparent focus-visible:ring-0" />
          <ResizablePanel key="player" minSize="560px">
            <PlayerSkeleton />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  )
}
