"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2Icon, TvIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ProgrammeCategoryIcon } from "@/components/programme-category-icon"
import { proxyImageUrl } from "@/lib/image-proxy"
import { cn } from "@/lib/utils"
import type { EpgProgramme } from "@/lib/stalker-types"
import {
  formatScheduleDate,
  formatTimeRange,
  scheduleDateKey,
} from "@/lib/tv-channels"
import { useTv } from "@/components/tv/tv-provider"
import { useChannelEpg } from "@/components/tv/channel-epg-provider"

export function ProgrammeGuide() {
  const { useImageProxy } = useTv()
  const {
    programmes,
    now,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useChannelEpg()

  return (
    <EpgSchedule
      programmes={programmes}
      now={now}
      isLoading={isLoading}
      error={error}
      useImageProxy={useImageProxy}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onLoadMore={loadMore}
    />
  )
}

function EpgSchedule({
  programmes,
  now,
  isLoading,
  error,
  useImageProxy,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  programmes: EpgProgramme[]
  now: number
  isLoading: boolean
  error: string
  useImageProxy: boolean
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore()
        }
      },
      { rootMargin: "200px" },
    )

    observer.observe(sentinel)
    return () => {
      observer.disconnect()
    }
  }, [hasMore, onLoadMore])

  const visibleProgrammes = programmes.filter(
    (programme) => new Date(programme.stopAt).getTime() > now,
  )

  return (
    <section className="mt-4 flex flex-col gap-4">
      <div className="flex items-center gap-2 px-1 md:gap-2.5">
        <TvIcon className="text-muted-foreground -mt-0.5 size-4 shrink-0 md:size-5" />
        <span className="text-base font-semibold md:text-xl">
          Programme Guide
        </span>
      </div>

      {isLoading ? (
        <ProgrammeGuideSkeleton />
      ) : error ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-4 text-sm">
          {error}
        </div>
      ) : visibleProgrammes.length ? (
        <div className="flex flex-col gap-3">
          {visibleProgrammes.map((programme, index) => {
            const start = new Date(programme.startAt).getTime()
            const stop = new Date(programme.stopAt).getTime()
            const isLive = start <= now && stop > now
            const progress = isLive
              ? Math.min(
                  100,
                  Math.max(0, ((now - start) / (stop - start)) * 100),
                )
              : 0

            const posterUrl = programme.posterUrl
              ? proxyImageUrl(programme.posterUrl, useImageProxy)
              : ""

            const previousProgramme = visibleProgrammes[index - 1]
            const showDateSeparator =
              !previousProgramme ||
              scheduleDateKey(programme.startAt) !==
                scheduleDateKey(previousProgramme.startAt)

            return (
              <div key={programme.id} className="flex flex-col gap-3">
                {showDateSeparator ? (
                  <div className="text-muted-foreground px-1 text-sm font-medium">
                    {formatScheduleDate(programme.startAt)}
                  </div>
                ) : null}
                <article className="bg-muted/20 relative overflow-hidden rounded-md p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-2 text-xs font-medium">
                        <span>
                          {formatTimeRange(programme.startAt, programme.stopAt)}
                        </span>
                        {programme.category ? (
                          <Badge variant="outline" className="h-5 gap-1">
                            <ProgrammeCategoryIcon
                              category={programme.category}
                              className="text-muted-foreground"
                            />
                            {programme.category}
                          </Badge>
                        ) : null}
                        {isLive ? <Badge className="h-5">On Air</Badge> : null}
                      </div>
                      <h3 className="truncate text-base font-semibold">
                        {programme.title}
                      </h3>
                      {programme.description ? (
                        <ProgrammeDescription
                          description={programme.description}
                        />
                      ) : null}
                      {isLive ? (
                        <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
                          <div
                            className="bg-primary h-full rounded-full"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                    {posterUrl ? (
                      <ProgrammeArtwork posterUrl={posterUrl} />
                    ) : null}
                  </div>
                </article>
              </div>
            )
          })}
          {hasMore ? (
            <div
              ref={sentinelRef}
              className="flex h-10 items-center justify-center"
            >
              {isLoadingMore ? (
                <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="bg-muted/20 text-muted-foreground flex h-28 items-center justify-center rounded-md px-4 text-center text-sm">
          No programme information available for this channel.
        </div>
      )}
    </section>
  )
}

/**
 * Synopses run from one line to several paragraphs, and the long ones push the
 * next programme off screen. Three lines is enough to tell what something is
 * without the schedule turning into a wall of prose.
 */
function ProgrammeDescription({ description }: { description: string }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isTruncated, setIsTruncated] = useState(false)
  const paragraphRef = useRef<HTMLParagraphElement>(null)

  // Most descriptions are a sentence or two and are never clamped, so the
  // toggle only appears once the text is genuinely cut off. Measuring is
  // skipped while expanded, where scrollHeight always equals clientHeight and
  // would report the text as fitting.
  useEffect(() => {
    const paragraph = paragraphRef.current

    if (!paragraph || isExpanded) {
      return
    }

    const measure = () => {
      setIsTruncated(paragraph.scrollHeight > paragraph.clientHeight + 1)
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(paragraph)
    return () => observer.disconnect()
  }, [description, isExpanded])

  return (
    <>
      <p
        ref={paragraphRef}
        className={cn(
          "text-muted-foreground text-sm leading-6",
          !isExpanded && "line-clamp-3",
        )}
      >
        {description}
      </p>
      {isTruncated ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="mt-1 h-auto px-0 text-xs"
        >
          {isExpanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </>
  )
}

function ProgrammeGuideSkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label="Loading programme guide"
    >
      <Skeleton className="ml-1 h-4 w-24" />
      {Array.from({ length: 3 }).map((_, index) => (
        <article
          key={index}
          className="bg-muted/20 flex min-h-28 flex-col gap-3 rounded-md p-4"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-5 w-3/5" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </article>
      ))}
    </div>
  )
}

function ProgrammeArtwork({ posterUrl }: { posterUrl: string }) {
  const [ambientImageLoaded, setAmbientImageLoaded] = useState(false)

  return (
    <div className="relative shrink-0 self-center">
      <div
        className={cn(
          "pointer-events-none absolute -inset-24 [mask-image:linear-gradient(to_left,black_0%,rgba(0,0,0,0.55)_35%,rgba(0,0,0,0.18)_65%,transparent_100%)] transition-opacity duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] [-webkit-mask-image:linear-gradient(to_left,black_0%,rgba(0,0,0,0.55)_35%,rgba(0,0,0,0.18)_65%,transparent_100%)] motion-reduce:transition-none",
          ambientImageLoaded ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Ambient glow uses the same arbitrary EPG poster host as the thumbnail below. */}
        <img
          src={posterUrl}
          alt=""
          className="size-full scale-[1.65] transform-gpu object-cover opacity-25 blur-[28px] contrast-125 saturate-150 dark:opacity-70 dark:contrast-100 dark:saturate-100"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setAmbientImageLoaded(true)}
        />
      </div>
      <div className="relative aspect-[5/7] max-h-40 w-20 overflow-clip rounded-md bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element -- Programme posters come from arbitrary EPG hosts. */}
        <img
          src={posterUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  )
}
