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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMediaQuery } from "@/hooks/use-media-query"

// Standalone light/dark/system control for the header. Signed-in users get the
// same options inside their account menu, so this is shown only when signed out
// (where there is no account menu to hold it).
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const currentTheme = theme ?? "system"
  // The same breakpoint the sign-in and account sheets use.
  const isMobile = useMediaQuery("(max-width: 639px)")
  const [open, setOpen] = React.useState(false)

  // Touch gets the same sheet the rest of the app uses; the dropdown below is
  // untouched and still serves every pointer device.
  if (isMobile) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 cursor-pointer rounded-md text-muted-foreground hover:text-foreground min-[940px]:size-8"
          aria-label="Theme"
          onClick={() => setOpen(true)}
        >
          <SunIcon className="size-4 dark:hidden" />
          <MoonIcon className="hidden size-4 dark:block" />
        </Button>
        <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
          <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md [--drawer-inset:0.5rem] after:hidden dark:border">
            <div className="flex flex-col gap-4 p-4 pt-2">
              <div className="min-w-0">
                <DrawerTitle className="text-left">Theme</DrawerTitle>
                <DrawerDescription className="text-left">
                  Match the system or pick one.
                </DrawerDescription>
              </div>
              <Tabs
                value={currentTheme}
                onValueChange={(value) => setTheme(value as string)}
              >
                <TabsList className="grid h-9 w-full grid-cols-3">
                  <TabsTrigger value="light" className="gap-1.5">
                    <SunIcon className="size-4" />
                    Light
                  </TabsTrigger>
                  <TabsTrigger value="dark" className="gap-1.5">
                    <MoonIcon className="size-4" />
                    Dark
                  </TabsTrigger>
                  <TabsTrigger value="system" className="gap-1.5">
                    <LaptopMinimalIcon className="size-4" />
                    System
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

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
