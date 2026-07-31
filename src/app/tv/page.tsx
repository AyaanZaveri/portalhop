import { EmptyPlayerPanel } from "@/components/tv/tv-placeholders"
import { PrimaryMeshGradientBackdrop } from "@/components/mesh-gradient-backdrop"

// The detail slot when no channel is selected. On desktop this is the right
// panel beside the channel list; on mobile the shell shows the list instead.
export default function TvIndexPage() {
  return (
    <div className="bg-background relative flex h-full flex-col overflow-hidden min-[940px]:rounded-2xl">
      <PrimaryMeshGradientBackdrop />
      <div className="relative z-10 flex min-h-16 items-center justify-between gap-3 px-4 pt-4 pb-3 min-[940px]:pr-[22rem]">
        <div className="flex min-w-0 flex-col">
          <p className="font-semibold">Select a channel</p>
          <p className="text-muted-foreground text-sm">
            Pick a channel from the sidebar to start playback.
          </p>
        </div>
      </div>
      <EmptyPlayerPanel showBackdrop={false} />
    </div>
  )
}
