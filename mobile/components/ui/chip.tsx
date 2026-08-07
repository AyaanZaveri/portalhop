import type { ComponentType } from "react"
import { StyleSheet, Text } from "react-native"
import type { LucideProps } from "lucide-react-native"

import { useTheme } from "@/lib/theme"
import { PressableScale } from "@/components/ui/pressable-scale"

/**
 * A filter chip above the channel list.
 *
 * Geometry comes from StyleSheet rather than className. Two attempts at the
 * latter rendered the colour but none of the size — Uniwind resolves classes at
 * build time, and neither a template literal nor an object lookup is
 * statically analyzable. A chip has exactly four variants, so spelling them out
 * here is both shorter and certain.
 */
const styles = StyleSheet.create({
  base: {
    // 32pt matches the web's touch chip (h-8); 36 read as chunky next to the
    // search field above it.
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 999,
  },
  wide: { paddingHorizontal: 11 },
  icon: { width: 32 },
  idle: { borderWidth: 1 },
})

export function Chip({
  label,
  icon: Icon,
  active,
  iconOnly,
  onPress,
}: {
  label: string
  icon: ComponentType<LucideProps>
  active: boolean
  iconOnly?: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()

  const foreground = active
    ? colors["primary-foreground"]
    : colors["muted-foreground"]

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[
        styles.base,
        iconOnly ? styles.icon : styles.wide,
        active
          ? { backgroundColor: colors.primary }
          : [styles.idle, { borderColor: colors.border }],
      ]}
    >
      <Icon size={15} color={foreground} />
      {iconOnly ? null : (
        <Text
          numberOfLines={1}
          style={{
            color: foreground,
            fontSize: 13,
            fontFamily: "Inter-Medium",
            includeFontPadding: false,
          }}
        >
          {label}
        </Text>
      )}
    </PressableScale>
  )
}
