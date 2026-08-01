"use client"

import * as React from "react"
import {
  CheckIcon,
  LaptopMinimalIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Standalone light/dark/system control for the header. Signed-in users get the
// same options inside their account menu, so this is shown only when signed out
// (where there is no account menu to hold it).
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const currentTheme = theme ?? "system"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => setTheme("light")} className="py-1.5">
          <SunIcon />
          <span>Light</span>
          {currentTheme === "light" ? <CheckIcon className="ml-auto" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="py-1.5">
          <MoonIcon />
          <span>Dark</span>
          {currentTheme === "dark" ? <CheckIcon className="ml-auto" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="py-1.5">
          <LaptopMinimalIcon />
          <span>System</span>
          {currentTheme === "system" ? <CheckIcon className="ml-auto" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
