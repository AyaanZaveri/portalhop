"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Spinner } from "@/components/ui/spinner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CheckIcon className="size-4 text-foreground" />
        ),
        info: (
          <InfoIcon className="size-4 text-foreground" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-foreground" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-foreground" />
        ),
        loading: (
          <Spinner className="text-foreground" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          description: "!text-foreground/70",
          loader: "text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
