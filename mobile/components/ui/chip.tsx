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
      className={`h-9 flex-row items-center justify-center gap-1.5 rounded-full ${
        iconOnly ? "w-9" : "px-3.5"
      } ${active ? "bg-primary" : "border border-border"}`}
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
