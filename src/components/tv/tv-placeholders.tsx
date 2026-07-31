"use client"

import { SearchIcon, TvIcon } from "lucide-react"

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
import { PortalHopWordmark } from "@/components/portal-hop-wordmark"
import { PrimaryMeshGradientBackdrop } from "@/components/mesh-gradient-backdrop"
import { useHydratedLayout } from "@/hooks/use-hydrated-layout"
import { useMediaQuery } from "@/hooks/use-media-query"

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

function ChannelListSkeleton() {
  return (
    <div className="bg-card flex h-full min-w-0 flex-col overflow-hidden rounded-2xl min-[940px]:min-w-80">
      <div className="flex flex-col gap-3 p-4 pb-2">
        <PortalHopWordmark className="mb-1" />
        <InputGroup>
          <InputGroupInput placeholder="Search channels" />
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
        {Array.from({ length: 14 }).map((_, index) => (
          <div
            key={index}
            className="mb-2 flex h-14 items-center gap-3 rounded-xl px-3"
          >
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlayerSkeleton() {
  return (
    <div className="bg-background relative flex h-full flex-col overflow-hidden rounded-2xl">
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

export function LoadingShell() {
  const isMobileLayout = useMediaQuery("(max-width: 939px)", true)
  const isReady = useHydratedLayout()

  // Mobile lands on the channel list, so its loading state is just the list.
  if (isReady && isMobileLayout) {
    return (
      <div className="bg-muted/30 h-full overflow-hidden p-3">
        <ChannelListSkeleton />
      </div>
    )
  }

  return (
    <div className="bg-muted/30 flex h-full w-full gap-1.5 overflow-hidden p-3">
      <ResizablePanelGroup orientation="horizontal" className="h-full gap-1.5">
        <ResizablePanel defaultSize="360px" minSize="320px" maxSize="520px">
          <ChannelListSkeleton />
        </ResizablePanel>
        <ResizableHandle className="bg-transparent focus-visible:ring-0" />
        <ResizablePanel minSize="560px">
          <PlayerSkeleton />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
