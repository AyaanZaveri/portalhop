"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  TvIcon,
} from "lucide-react"

import {
  groupChannels,
  orderByChosenSource,
} from "@portalhop/shared/channel-grouping"

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
import { TV_MOBILE_LAYOUT_QUERY, useMediaQuery } from "@/hooks/use-media-query"
import {
  externalPlayers,
  getClientPlatform,
  getChannelKey,
  getExternalPlayerLabel,
  getExternalPlayerUrl,
  getStreamLogoUrl,
  resolveChannelLink,
  type ClientPlatform,
  type ExternalPlayer,
  type PortalChannelWithSource,
} from "@/lib/tv-channels"
import { ChannelList } from "@/components/tv/channel-list"
import { ChannelSourcesDrawer } from "@/components/tv/channel-sources-drawer"
import {
  LoadingShell,
  NoPortalsSelected,
} from "@/components/tv/tv-placeholders"
import { useTv } from "@/components/tv/tv-provider"
import {
  channelHref,
  useActiveChannelSlug,
  useActiveChannelSourceId,
} from "@/hooks/use-active-channel"

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
    channelSlug,
    sourceOrder,
    setChannelSourceOrder,
    trustedIds,
    useImageProxy,
    browseFilter,
  } = useTv()

  const isMobileLayout = useMediaQuery(TV_MOBILE_LAYOUT_QUERY, true)
  const isReady = useHydratedLayout()
  const segment = useActiveChannelSlug()
  const selectedSourceId = useActiveChannelSourceId()
  const router = useRouter()
  const defaultChannel = segment ? channelIndex.get(segment) : undefined
  const currentChannel = selectedSourceId
    ? (browserChannels.find(
        (entry) =>
          entry.savedChannelId === selectedSourceId &&
          channelSlug(entry) === segment,
      ) ?? defaultChannel)
    : defaultChannel
  const [sourcesOpen, setSourcesOpen] = useState(false)

  const sourceGroup = useMemo(() => {
    if (!currentChannel) return null
    return (
      groupChannels(browserChannels).find((group) =>
        group.members.some(
          (entry) => getChannelKey(entry) === getChannelKey(currentChannel),
        ),
      ) ?? null
    )
  }, [browserChannels, currentChannel])

  const sources = useMemo(
    () =>
      sourceGroup
        ? orderByChosenSource(sourceGroup.members, sourceOrder, trustedIds)
        : currentChannel
          ? [currentChannel]
          : [],
    [currentChannel, sourceGroup, sourceOrder, trustedIds],
  )
  const sourceIdentityKey = sourceGroup?.key.startsWith("id:")
    ? sourceGroup.key
    : null

  const selectSource = useCallback(
    (source: PortalChannelWithSource) => {
      router.push(channelHref(channelSlug(source), source.savedChannelId))
      setSourcesOpen(false)
    },
    [channelSlug, router],
  )

  const updateSourceOrder = useCallback(
    (ordered: PortalChannelWithSource[]) => {
      if (!sourceIdentityKey || ordered[0]?.savedChannelId == null) return
      setChannelSourceOrder(
        sourceIdentityKey,
        ordered
          .map((source) => source.savedChannelId)
          .filter((id): id is number => typeof id === "number"),
      )
    },
    [setChannelSourceOrder, sourceIdentityKey],
  )

  // Each row wears what its own portal shipped, not the channel's mark. Every
  // row here is the same channel, so the channel's mark would be the same
  // picture nine times and the list would say nothing.
  const sourceLogoUrl = useCallback(
    (source: PortalChannelWithSource) => getStreamLogoUrl(source, useImageProxy),
    [useImageProxy],
  )

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
      <div className="bg-background h-full overflow-hidden">
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
          {segment ? (
            children
          ) : (
            <ChannelList headerControls={utilityControls} />
          )}
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
    <main className="tv-shell bg-background text-foreground h-screen overflow-hidden">
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
            <div className="flex items-center gap-2">
              {sources.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  onClick={() => setSourcesOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={sourcesOpen}
                  aria-label="Choose stream source"
                  className="max-w-40"
                >
                  <span className="truncate">
                    {currentChannel.portalSource?.name ?? "Manual"}
                  </span>
                  <ChevronDownIcon className="size-4 shrink-0 opacity-70" />
                </Button>
              ) : null}
              <StreamActionsMenu channel={currentChannel} />
            </div>
          ) : null}
          <div
            className={
              segment
                ? "flex items-center gap-1"
                : "hidden min-[940px]:flex min-[940px]:items-center min-[940px]:gap-1"
            }
          >
            {utilityControls}
          </div>
        </div>

        {content}
        {currentChannel ? (
          <ChannelSourcesDrawer
            sources={sources}
            activeSourceKey={getChannelKey(currentChannel)}
            canRemember={Boolean(sourceIdentityKey)}
            onSelect={selectSource}
            onOrderChange={updateSourceOrder}
            getLogoUrl={sourceLogoUrl}
            open={sourcesOpen}
            onOpenChange={setSourcesOpen}
            isMobileLayout={isMobileLayout}
          />
        ) : null}
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

function StreamActionsMenu({ channel }: { channel: PortalChannelWithSource }) {
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
            // Not size="icon". The label moved into the menu, but the trigger
            // still carries two glyphs, and a square meant for one squeezed
            // them against each other and against the source button beside it.
            // This is the width the mobile trigger always had.
            size="default"
            className="px-2"
            disabled={busy}
            aria-label="Open in player"
          />
        }
      >
        <TvIcon className="-mt-px size-4" />
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
