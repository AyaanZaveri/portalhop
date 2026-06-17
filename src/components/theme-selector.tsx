"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { LaptopMinimal, Moon, SunMedium, Contrast, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  
  // Clean mounting check via useSyncExternalStore to avoid hydration mismatch and setState in useEffect warnings
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground"
        aria-label="Theme selector"
        disabled
      >
        <Contrast className="size-4" />
      </Button>
    );
  }

  const currentTheme = theme ?? "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 cursor-pointer rounded-md text-muted-foreground hover:text-foreground"
            aria-label="Theme selector"
          />
        }
      >
        <Contrast className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <SunMedium className="size-4" />
            Light
          </span>
          {currentTheme === "light" && <Check className="size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Moon className="size-4" />
            Dark
          </span>
          {currentTheme === "dark" && <Check className="size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <LaptopMinimal className="size-4" />
            System
          </span>
          {currentTheme === "system" && <Check className="size-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
