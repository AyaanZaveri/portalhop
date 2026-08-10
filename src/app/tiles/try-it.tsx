"use client"

import { ArrowUpIcon, ImageUpIcon, RotateCcwIcon } from "lucide-react"
import { useEffect } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ShimmeringText } from "@/components/ui/shimmering-text"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useFileUpload } from "@/hooks/use-file-upload"

import { After, Arrow, Before, ROUTE } from "./parts"
import { usePass } from "./use-pass"

/* Larger than every logo in the catalogue by a wide margin. The cap is not
   really about memory, it is so a holiday photo dropped in by accident fails
   with a sentence rather than by locking the tab up in the flood fill. */
const MAX_SIZE = 8 * 1024 * 1024

/* Three times the app's own tile, matching the figures further down, so the
   result is read at the same size as everything else the page argues from. The
   step down is for narrow screens: the pair is two tiles and an arrow laid out
   in pixels, and at three times it is wider than a phone. Chosen from a media
   query rather than CSS because the geometry is inline, and the flash that
   normally costs is not payable here, since nothing renders until a file has
   been chosen and that cannot happen before hydration. */
const WIDE = "(min-width: 640px)"

/**
 * The two tiles, headed, with the branch the pass took underneath.
 *
 * Its own component because usePass is a hook and the file it reads only exists
 * once somebody has chosen one. Built from Before and After rather than from
 * Pair, which puts a channel name in a fourth column: here the equivalent would
 * be the upload's filename, which nobody needs told and which is usually
 * something like dyn-767dc4df566c157daf90885bdcb4e278.png.
 *
 * The headings say Before and After, the same two words the roster at the top of
 * the page puts over the same two tiles. Original and its partner would read
 * fine in isolation, but this is the roster's operation done to the reader's own
 * file, and giving it a second vocabulary invites the question of whether it is
 * a second thing.
 */
function Result({
  url,
  scale,
  onReset,
}: {
  url: string
  scale: number
  onReset: () => void
}) {
  const pass = usePass(url)
  const route = pass.trace ? ROUTE[pass.trace.route] : undefined

  return (
    <div className="t-try-result">
      {/* In the panel's corner rather than in the stack, because it is the only
          thing here that is not about a tile. Before, after and the branch are
          all statements about the logo; this is a statement about the run. Mono
          and tabular so the digits hold their column, since the number changes
          every time and this sits at a fixed edge. */}
      {pass.ms !== undefined ? (
        <p className="t-try-timing">Done in {Math.max(1, Math.round(pass.ms))} ms</p>
      ) : null}

      <div className="t-try-scroll">
        <div className="t-try-stage" style={{ ["--tile" as string]: `${66 * scale}px` }}>
          <span className="t-try-label">Before</span>
          <span />
          <span className="t-try-label">After</span>
          <Before url={url} scale={scale} />
          <Arrow scale={scale} />
          <After pass={pass} scale={scale} />

          {/* Under the after tile, in its column, with no lead-in. The badge is
              answering the question the tile above it already asked, and a
              branch is only ever one of five, so there is nothing for a caption
              to disambiguate. */}
          <div className="t-try-verdict">
            {route ? (
              <Badge variant="outline" className="gap-1.5">
                <route.Icon className="size-3" strokeWidth={2} aria-hidden />
                {route.label}
              </Badge>
            ) : (
              <ShimmeringText text="Measuring" duration={1.4} />
            )}
          </div>
        </div>
      </div>

      {/* Set further down than the gap alone would put it. It is the way out of
          this state, not part of the result, and sitting close it competed with
          the thing the panel exists to show. */}
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        onClick={onReset}
      >
        <RotateCcwIcon data-icon="inline-start" />
        Try another logo
      </Button>
    </div>
  )
}

export function TryIt() {
  const isWide = useMediaQuery(WIDE)
  const [{ files, isDragging, errors }, actions] = useFileUpload({
    accept: "image/*",
    multiple: false,
    maxSize: MAX_SIZE,
  })

  const { addFiles } = actions
  useEffect(() => {
    // On the window rather than on the panel. Asking someone to click a drop
    // zone before pasting into it defeats the point of offering paste, and
    // there is nothing else on this page that wants a paste.
    const onPaste = (event: ClipboardEvent) => {
      const image = Array.from(event.clipboardData?.files ?? []).find((file) =>
        file.type.startsWith("image/"),
      )
      if (!image) return
      event.preventDefault()
      addFiles([image])
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [addFiles])

  const chosen = files[0]

  return (
    <div
      className="t-try-panel"
      data-dragging={isDragging || undefined}
      onDragEnter={actions.handleDragEnter}
      onDragLeave={actions.handleDragLeave}
      onDragOver={actions.handleDragOver}
      onDrop={actions.handleDrop}
    >
      {/* Off-screen but still the thing the dialog reads from. Out of the tab
          order and out of the accessibility tree, because the button below is
          the same control with a name and a visible focus ring, and offering
          both would put two ways to do one thing in front of a screen reader.
          Safe to hide: nothing ever focuses it, it is only clicked. */}
      <input
        {...actions.getInputProps({ tabIndex: -1, "aria-hidden": true })}
        className="sr-only"
      />

      {chosen?.preview ? (
        <Result url={chosen.preview} scale={isWide ? 3 : 1.5} onReset={actions.clearFiles} />
      ) : (
        <>
          <ImageUpIcon className="t-try-icon" strokeWidth={1.75} aria-hidden />
          <p className="t-try-lead">Drop a channel logo here</p>
          <p className="t-try-hint">
            Or paste an image anywhere on this page. Nothing is uploaded, the
            pass runs on the file in your browser.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-1"
            onClick={actions.openFileDialog}
          >
            <ArrowUpIcon data-icon="inline-start" />
            Choose a file
          </Button>
        </>
      )}

      {/* Always in the DOM, empty until there is something to say. A live region
          that appears at the same moment as its text is frequently not read at
          all, because there was nothing there to be watching. */}
      <p className="t-try-error" role="status" aria-live="polite">
        {errors.length ? "Choose an image file under 8 MB." : null}
      </p>
    </div>
  )
}
