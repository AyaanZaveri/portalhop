import { cn } from "@/lib/utils"

/**
 * The filter chips above the channel list. Shared with the loading placeholder
 * so both render identically. Chips are a little taller on touch layouts, where
 * they are the primary way to move around the list.
 */
export function chipButtonProps(
  active: boolean,
  options?: { wide?: boolean; iconOnly?: boolean },
) {
  return {
    variant: active ? ("default" as const) : ("outline" as const),
    size: "sm" as const,
    className: cn(
      "h-8 rounded-full min-[940px]:h-7",
      options?.iconOnly
        ? "w-8 shrink-0 px-0 min-[940px]:w-7"
        : "px-3 min-[940px]:px-2.5",
      options?.wide && "min-w-0 max-w-full shrink!",
      !options?.wide && !options?.iconOnly && "max-w-40 shrink-0",
      !active && "text-muted-foreground",
    ),
  }
}
