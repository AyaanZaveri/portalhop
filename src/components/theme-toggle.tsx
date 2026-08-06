"use client"

import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu"
import { ThemeSegmentedControl } from "@/components/theme-segmented-control"

// Standalone light/dark/system control for the header. Signed-in users get the
// same options inside their account menu, so this is shown only when signed out
// (where there is no account menu to hold it).
export function ThemeToggle() {
  return (
    <ResponsiveMenu>
      <ResponsiveMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-9 cursor-pointer rounded-md text-muted-foreground hover:text-foreground min-[940px]:size-8"
            aria-label="Theme"
          />
        }
      >
        {/* Reflect what's actually on screen so the icon matches "system" too. */}
        <SunIcon className="size-4 dark:hidden" />
        <MoonIcon className="hidden size-4 dark:block" />
      </ResponsiveMenuTrigger>
      <ResponsiveMenuContent align="end" title="Theme" className="w-auto p-2">
        <ThemeSegmentedControl />
      </ResponsiveMenuContent>
    </ResponsiveMenu>
  )
}
