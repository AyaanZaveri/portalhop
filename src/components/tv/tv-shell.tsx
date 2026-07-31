"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useSelectedLayoutSegment } from "next/navigation"
import { toast } from "sonner"
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  TvIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { AddPortalSheet } from "@/components/add-portal-sheet"
import { AuthDialog } from "@/components/auth-dialog"
import { ThemeToggle } from "@/components/theme-toggle"
import { copyTextToClipboard } from "@/lib/clipboard"
import { useHydratedLayout } from "@/hooks/use-hydrated-layout"
import { useMediaQuery } from "@/hooks/use-media-query"
import {
  externalPlayers,
  getClientPlatform,
  getExternalPlayerLabel,
  getExternalPlayerUrl,
  resolveChannelLink,
  type ClientPlatform,
  type ExternalPlayer,
  type PortalChannelWithSource,
} from "@/lib/tv-channels"
import { ChannelList } from "@/components/tv/channel-list"
import {
  LoadingShell,
  NoPortalsSelected,
} from "@/components/tv/tv-placeholders"
import { useTv } from "@/components/tv/tv-provider"

export function TvShell({ children }: { children: ReactNode }) {
  const {
    isLoadingPortals,
    iptvOrgLoading,
    browserChannels,
    userId,
    settingsLoaded,
    iptvOrgEnabled,
    updateSettings,
    sheetOpen,
    setSheetOpen,
    onSheetSaved,
    onSheetView,
    channelIndex,
    browseFilter,
  } = useTv()

  const isMobileLayout = useMediaQuery("(max-width: 939px)", true)
  const isReady = useHydratedLayout()
  const segment = useSelectedLayoutSegment()
  const currentChannel = segment ? channelIndex.get(segment) : undefined

  const utilityControls = (
    <>
      {settingsLoaded && !userId ? <ThemeToggle /> : null}
      <AuthDialog />
    </>
  )

  const isLoading = isLoadingPortals || iptvOrgLoading
  const hasChannels = browserChannels.length > 0

  let content: ReactNode
  if (isLoading) {
    content = (
      <LoadingShell
        headerControls={segment ? undefined : utilityControls}
        browseFilter={browseFilter}
      />
    )
  } else if (!hasChannels) {
    content = (
      <NoPortalsSelected
        signedIn={Boolean(userId)}
        onEnableFreeChannels={
          iptvOrgEnabled
            ? undefined
            : () => updateSettings({ iptvOrgEnabled: true })
        }
      />
    )
  } else if (isReady && isMobileLayout) {
    content = (
      <div className="bg-background h-full overflow-hidden min-[940px]:bg-muted/30 min-[940px]:p-3">
        {segment ? children : <ChannelList headerControls={utilityControls} />}
      </div>
    )
  } else if (isReady) {
    content = (
      <div className="bg-muted/30 flex h-full w-full gap-1.5 overflow-hidden p-3">
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
            <ChannelList />
          </ResizablePanel>
          <ResizableHandle className="bg-transparent focus-visible:ring-0" />
          <ResizablePanel key="player" minSize="560px">
            {children}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  } else {
    // Before hydration, let CSS choose the viewport-specific shell so mobile
    // never briefly renders the desktop split. The hydrated version swaps in
    // the resizable desktop layout without changing the visible structure.
    content = (
      <>
        <div className="bg-background h-full overflow-hidden min-[940px]:hidden">
          {segment ? children : <ChannelList headerControls={utilityControls} />}
        </div>
        <div className="bg-muted/30 hidden h-full w-full gap-1.5 overflow-hidden p-3 min-[940px]:flex">
          <div className="min-h-0 w-[360px] max-w-[520px] min-w-80 shrink-0">
            <ChannelList />
          </div>
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </>
    )
  }

  return (
    <main className="bg-background text-foreground h-screen overflow-hidden">
      <div className="relative h-full w-full">
        <AddPortalSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onSaved={onSheetSaved}
          onView={onSheetView}
        />

        <div
          className={`absolute right-4 z-20 flex items-center gap-2 ${
            segment ? "top-[22px]" : "top-3.5"
          } min-[940px]:top-6 min-[940px]:right-6`}
        >
          {currentChannel ? (
            <StreamActionsMenu
              channel={currentChannel}
              isMobileLayout={isMobileLayout}
            />
          ) : null}
          <div className={segment ? "flex items-center gap-1" : "hidden min-[940px]:flex min-[940px]:items-center min-[940px]:gap-1"}>
            {utilityControls}
          </div>
        </div>

        {content}
      </div>
    </main>
  )
}

function PlayerLogo({ player }: { player: ExternalPlayer }) {
  const extension = player === "vlc" ? "svg" : "png"
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Player logos are local static assets.
    <img
      src={`/players/${player}/logo.${extension}`}
      alt=""
      className="size-4 shrink-0 rounded-[3px] object-contain"
    />
  )
}

function StreamActionsMenu({
  channel,
  isMobileLayout,
}: {
  channel: PortalChannelWithSource
  isMobileLayout: boolean
}) {
  const { endpoint, previewSourceRequest, useProxy } = useTv()
  const [clientPlatform, setClientPlatform] = useState<ClientPlatform>("other")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClientPlatform(
      getClientPlatform(navigator.userAgent, navigator.maxTouchPoints),
    )
  }, [])

  const availableExternalPlayers = externalPlayers.filter(({ platforms }) =>
    platforms.includes(clientPlatform),
  )

  const runAction = async (action: "copy" | ExternalPlayer) => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const toastId = toast.loading(`Pulling ${channel.name || "stream"}`, {
      description: "Resolving the latest stream from the portal.",
    })
    try {
      const streamLink = await resolveChannelLink(channel, {
        endpoint,
        portalRequest: previewSourceRequest,
        useProxy,
      })
      if (action === "copy") {
        await copyTextToClipboard(streamLink)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
        toast.dismiss(toastId)
        toast.success("Copied stream", {
          description: channel.name,
          icon: <CheckIcon className="text-foreground size-4" />,
        })
      } else {
        window.location.assign(getExternalPlayerUrl(action, streamLink))
        toast.dismiss(toastId)
        toast.success(`Opening in ${getExternalPlayerLabel(action)}`, {
          description: channel.name,
          icon: <CheckIcon className="text-foreground size-4" />,
        })
      }
    } catch (error) {
      setFailed(true)
      window.setTimeout(() => setFailed(false), 1800)
      toast.dismiss(toastId)
      toast.error("Could not pull stream", {
        description: error instanceof Error ? error.message : channel.name,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="default"
            className={isMobileLayout ? "px-2" : undefined}
            disabled={busy}
            aria-label="Open stream actions"
          />
        }
      >
        <TvIcon className="-mt-px size-4" />
        {!isMobileLayout && "Open in player"}
        <ChevronDownIcon className="size-4 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {availableExternalPlayers.length > 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Open stream in</DropdownMenuLabel>
            {availableExternalPlayers.map((player) => (
              <DropdownMenuItem
                key={player.id}
                disabled={busy}
                onClick={() => runAction(player.id)}
                className="py-1.5"
              >
                <PlayerLogo player={player.id} />
                <span>{player.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : null}
        {availableExternalPlayers.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          disabled={busy}
          onClick={() => runAction("copy")}
          className="py-1.5"
        >
          {copied ? <CheckIcon /> : failed ? <AlertCircleIcon /> : <CopyIcon />}
          Copy stream
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
