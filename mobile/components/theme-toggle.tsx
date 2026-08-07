import { Moon, Sun } from "lucide-react-native"

import { useTheme } from "@/lib/theme"
import { PressableScale } from "@/components/ui/pressable-scale"

/**
 * Straight light/dark flip rather than a light/dark/system picker.
 *
 * The scheme still follows the system until the first tap, which is the
 * behaviour most people want; the moment someone reaches for this control they
 * have decided they want the other one, and a three-way menu makes them pick
 * twice. The web app keeps its three-way choice, where a header has room for it.
 */
export function ThemeToggle() {
  const { isDark, colors, toggle } = useTheme()
  const Icon = isDark ? Moon : Sun

  return (
    <PressableScale
      preset="icon"
      hitSlop={10}
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="size-9 items-center justify-center rounded-lg"
    >
      <Icon size={19} color={colors["muted-foreground"]} />
    </PressableScale>
  )
}
