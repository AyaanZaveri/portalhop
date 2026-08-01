import { cn } from "@/lib/utils"

/**
 * The filter chips above the channel list. Shared with the loading placeholder
 * so both render identically. Chips are a little taller on touch layouts, where
 * they are the primary way to move around the list.
 */
export function chipButtonProps(
  active: boolean,
  options?: { wide?: boolean; iconOnly?: boolean; collapsible?: boolean },
) {
  return {
    variant: active ? ("default" as const) : ("outline" as const),
    size: "sm" as const,
    className: cn(
      "h-8 shrink-0 rounded-full min-[940px]:h-7",
      options?.iconOnly
        ? "w-8 px-0 min-[940px]:w-7"
        : "px-3 min-[940px]:px-2.5",
      options?.wide && "min-w-0 max-w-full",
      !options?.wide && !options?.iconOnly && "max-w-40",
      // Drop the label rather than let the row wrap in a narrow sidebar. The
      // widths mirror the icon-only chip so it collapses to the same circle.
      options?.collapsible &&
      "@max-[19.5rem]:w-8 @max-[19.5rem]:px-0 @max-[19.5rem]:min-[940px]:w-7 @max-[19.5rem]:min-[940px]:px-0",
      !active && "text-muted-foreground",
    ),
  }
}

/** Applied to a collapsible chip's label so it stays available to screen
 * readers once the chip narrows to its icon. */
export const chipLabelCollapse = "@max-[19.5rem]:sr-only"
