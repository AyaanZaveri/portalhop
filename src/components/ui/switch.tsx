"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
        "bg-zinc-200 dark:bg-zinc-800 data-[checked]:bg-primary dark:data-[checked]:bg-primary",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200",
          "data-[checked]:translate-x-4 translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
