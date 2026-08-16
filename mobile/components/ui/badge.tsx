import { Text, View } from "react-native"

import { useTheme, withAlpha } from "@/lib/theme"

/**
 * A small fact about the thing beside it.
 *
 * One component because these turn up in a row and have to look like a set:
 * the portal a stream came from, what resolution it turned out to be, how many
 * frames it sends. Given separate treatments they read as separate kinds of
 * information, when the point is that they are the same kind — short, factual,
 * and subordinate to the name above them.
 *
 * Tabular figures throughout. Half of these are numbers, and a row of badges
 * whose widths depend on which digits they happen to contain does not line up
 * between one source and the next.
 */
export function Badge({ children }: { children: string }) {
  const { colors } = useTheme()

  return (
    <View
      className="h-5 shrink-0 justify-center rounded-md px-1.5"
      style={{ backgroundColor: withAlpha(colors.muted, 0.8) }}
    >
      <Text
        numberOfLines={1}
        className="text-muted-foreground font-medium text-[10px]"
        style={{ includeFontPadding: false, fontVariant: ["tabular-nums"] }}
      >
        {children}
      </Text>
    </View>
  )
}
