"use client"

import { LaptopMinimalIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

const themes = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: LaptopMinimalIcon },
] as const

/**
 * Light/dark/system as one segmented control rather than a list of rows or a
 * submenu. Three mutually exclusive options read better side by side: the
 * current one is visible without opening anything, and switching is one tap
 * instead of two.
 */
export function ThemeSegmentedControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const currentTheme = theme ?? "system"

  return (
    <ToggleGroup
      // A radio group, not a set of independent toggles: exactly one theme is
      // always active, and clicking the active one must not clear it.
      multiple={false}
      value={[currentTheme]}
      onValueChange={(value) => {
        const next = value[0]
        if (next) setTheme(next)
      }}
      variant="outline"
      spacing={0}
      aria-label="Theme"
      className={cn("w-full", className)}
    >
      {themes.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          className="h-10 flex-1"
        >
          <Icon data-icon="inline-start" />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
