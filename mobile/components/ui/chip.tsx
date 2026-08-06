import type { ComponentType } from "react"
import { Text } from "react-native"
import type { LucideProps } from "lucide-react-native"

import { useTheme } from "@/lib/theme"
import { PressableScale } from "@/components/ui/pressable-scale"

/**
 * A filter chip above the channel list.
 *
 * Mirrors the web's chipButtonProps: a pill that is filled when active and
 * outlined-with-muted-text when not. Taller than the web's desktop chip because
 * on touch these are the main way to move around the list.
 */
// Every variant spelled out as a complete literal rather than assembled with
// interpolation. Uniwind resolves className at build time, and a template
// literal is not statically analyzable — which is why the chips rendered with
// their colour but none of their geometry.
const CHIP_CLASSES = {
  active: {
    wide: "h-9 flex-row items-center justify-center gap-1.5 rounded-full bg-primary px-3.5",
    icon: "h-9 w-9 flex-row items-center justify-center gap-1.5 rounded-full bg-primary",
  },
  idle: {
    wide: "h-9 flex-row items-center justify-center gap-1.5 rounded-full border border-border px-3.5",
    icon: "h-9 w-9 flex-row items-center justify-center gap-1.5 rounded-full border border-border",
  },
} as const

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
      className={CHIP_CLASSES[active ? "active" : "idle"][iconOnly ? "icon" : "wide"]}
    >
      <Icon size={15} color={foreground} />
      {iconOnly ? null : (
        <Text
          numberOfLines={1}
          className="text-[13px] font-medium"
          style={{ color: foreground, includeFontPadding: false }}
        >
          {label}
        </Text>
      )}
    </PressableScale>
  )
}
