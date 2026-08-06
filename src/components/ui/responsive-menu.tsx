"use client"

import * as React from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Separator } from "@/components/ui/separator"
import { TV_MOBILE_LAYOUT_QUERY, useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

// A menu that is a dropdown on a pointer device and a bottom sheet on a touch
// one. A dropdown anchored to a 32px icon button is a poor target on a phone:
// it opens away from the thumb, its rows are sized for a cursor, and nested
// submenus have no good touch gesture. The call sites stay declarative — the
// same tree renders either presentation.
//
// The same mobile-layout query the TV shell uses, so the whole app agrees on
// what "mobile" means rather than each surface picking its own breakpoint.

type ResponsiveMenuContextValue = { isMobile: boolean }

const ResponsiveMenuContext =
  React.createContext<ResponsiveMenuContextValue | null>(null)

function useResponsiveMenu() {
  const context = React.useContext(ResponsiveMenuContext)

  if (!context) {
    throw new Error("useResponsiveMenu must be used within a ResponsiveMenu.")
  }

  return context
}

function ResponsiveMenu({
  children,
  open,
  onOpenChange,
  ...props
}: {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useMediaQuery(TV_MOBILE_LAYOUT_QUERY, true)
  const contextValue = React.useMemo(() => ({ isMobile }), [isMobile])

  return (
    <ResponsiveMenuContext.Provider value={contextValue}>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle {...props}>
          {children}
        </Drawer>
      ) : (
        <DropdownMenu open={open} onOpenChange={onOpenChange} {...props}>
          {children}
        </DropdownMenu>
      )}
    </ResponsiveMenuContext.Provider>
  )
}

function ResponsiveMenuTrigger({
  render,
  children,
  ...props
}: {
  render?: React.ReactElement
  children?: React.ReactNode
} & React.ComponentProps<"button">) {
  const { isMobile } = useResponsiveMenu()
  const Trigger = isMobile ? DrawerTrigger : DropdownMenuTrigger

  return (
    <Trigger render={render} {...props}>
      {children}
    </Trigger>
  )
}

/**
 * `title` is shown as the sheet's heading on mobile and is required for the
 * drawer's accessible name; on desktop it is dropped, since a dropdown is
 * already labelled by its trigger.
 */
function ResponsiveMenuContent({
  className,
  children,
  title,
  align = "end",
  ...props
}: {
  className?: string
  children: React.ReactNode
  title: string
  align?: "start" | "center" | "end"
}) {
  const { isMobile } = useResponsiveMenu()

  if (!isMobile) {
    return (
      <DropdownMenuContent align={align} className={className} {...props}>
        {children}
      </DropdownMenuContent>
    )
  }

  return (
    <DrawerContent className={cn("max-h-[85svh]", className)}>
      <DrawerHeader className="pb-2">
        <DrawerTitle className="text-left">{title}</DrawerTitle>
      </DrawerHeader>
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto p-2 pt-0">
        {children}
      </div>
    </DrawerContent>
  )
}

function ResponsiveMenuGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { isMobile } = useResponsiveMenu()

  if (!isMobile) {
    return <DropdownMenuGroup className={className}>{children}</DropdownMenuGroup>
  }

  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>
}

function ResponsiveMenuSeparator({ className }: { className?: string }) {
  const { isMobile } = useResponsiveMenu()

  if (!isMobile) {
    return <DropdownMenuSeparator className={className} />
  }

  return <Separator className={cn("my-1", className)} />
}

/**
 * A row in the menu. On mobile it becomes a full-width control tall enough to
 * hit with a thumb; `render` still works for links, exactly as the dropdown's
 * own item does.
 */
function ResponsiveMenuItem({
  className,
  children,
  render,
  disabled,
  onClick,
  closeOnClick = true,
  ...props
}: {
  className?: string
  children: React.ReactNode
  render?: React.ReactElement
  disabled?: boolean
  onClick?: (event: React.MouseEvent<HTMLElement>) => void
  closeOnClick?: boolean
}) {
  const { isMobile } = useResponsiveMenu()

  if (!isMobile) {
    return (
      <DropdownMenuItem
        className={cn("py-1.5", className)}
        render={render}
        disabled={disabled}
        onClick={onClick}
        closeOnClick={closeOnClick}
        {...props}
      >
        {children}
      </DropdownMenuItem>
    )
  }

  const rowClassName = cn(
    "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] font-medium",
    "text-foreground outline-none transition-colors",
    "active:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "disabled:pointer-events-none disabled:opacity-50",
    // Match the dropdown's icon treatment so both presentations read alike.
    "[&_svg:not([class*='size-'])]:size-5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
    className,
  )

  const row = render ? (
    React.cloneElement(
      render,
      {
        className: cn(
          rowClassName,
          (render.props as { className?: string }).className,
        ),
        onClick,
        ...props,
      } as React.HTMLAttributes<HTMLElement>,
      children,
    )
  ) : (
    <button
      type="button"
      className={rowClassName}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  )

  // A plain row has no idea it sits in a sheet, so selecting one would leave
  // the sheet open. DrawerClose gives it the dismiss the dropdown item has by
  // default; opting out matches the dropdown's closeOnClick={false}.
  return closeOnClick ? <DrawerClose render={row} /> : row
}

export {
  ResponsiveMenu,
  ResponsiveMenuTrigger,
  ResponsiveMenuContent,
  ResponsiveMenuGroup,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  useResponsiveMenu,
}
