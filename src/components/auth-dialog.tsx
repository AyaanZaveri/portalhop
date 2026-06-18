"use client"

import * as React from "react"
import {
  CheckIcon,
  LaptopMinimalIcon,
  LogInIcon,
  Loader2Icon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  SunMoonIcon,
  UserIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { siGoogle } from "simple-icons"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)")
    const update = () => setIsMobile(mediaQuery.matches)

    update()
    mediaQuery.addEventListener("change", update)

    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return isMobile
}

function GoogleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4 shrink-0"
      fill={`#${siGoogle.hex}`}
    >
      <path d={siGoogle.path} />
    </svg>
  )
}

function SignInContent() {
  const [isSigningIn, setIsSigningIn] = React.useState(false)

  async function signInWithGoogle() {
    setIsSigningIn(true)

    try {
      await authClient.signIn.social({
        provider: "google",
      })
    } catch (error) {
      setIsSigningIn(false)
      console.error(error)
      toast.error("Could not start Google sign in.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
        Sign in to sync your Portal Hop data with your Google account.
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-center gap-2"
        disabled={isSigningIn}
        onClick={signInWithGoogle}
      >
        {isSigningIn ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Sign in with Google
      </Button>
    </div>
  )
}

type SessionUser = {
  name?: string | null
  email?: string | null
  image?: string | null
}

function UserAvatar({
  user,
  className = "size-6",
}: {
  user: SessionUser
  className?: string
}) {
  const fallback = (user.name || user.email || "User").trim().charAt(0).toUpperCase()

  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.image}
        alt=""
        className={`${className} rounded-full object-cover`}
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <span
      className={`${className} flex items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground`}
    >
      {fallback || <UserIcon className="size-3.5" />}
    </span>
  )
}

function AccountMenu({
  user,
  onSignedOut,
}: {
  user: SessionUser
  onSignedOut: () => Promise<void>
}) {
  const [isSigningOut, setIsSigningOut] = React.useState(false)
  const { theme, setTheme } = useTheme()
  const currentTheme = theme ?? "system"

  async function signOut() {
    setIsSigningOut(true)

    try {
      await authClient.signOut()
      await onSignedOut()
      toast.success("Signed out")
    } catch (error) {
      console.error(error)
      toast.error("Could not sign out.")
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 cursor-pointer rounded-md text-muted-foreground hover:text-foreground"
            aria-label="Account"
          />
        }
      >
        <UserAvatar user={user} className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="flex min-w-0 items-center gap-2 px-1 py-1.5 text-left text-sm">
          <UserAvatar user={user} className="size-8" />
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">
              {user.name || "Signed in"}
            </span>
            {user.email ? (
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            ) : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="py-1.5">
              <SunMoonIcon />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setTheme("light")} className="py-1.5">
                  <SunIcon />
                  <span>Light</span>
                  {currentTheme === "light" ? (
                    <CheckIcon className="ml-auto" />
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")} className="py-1.5">
                  <MoonIcon />
                  <span>Dark</span>
                  {currentTheme === "dark" ? (
                    <CheckIcon className="ml-auto" />
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")} className="py-1.5">
                  <LaptopMinimalIcon />
                  <span>System</span>
                  {currentTheme === "system" ? (
                    <CheckIcon className="ml-auto" />
                  ) : null}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isSigningOut}
          onClick={signOut}
          className="py-1.5"
        >
          {isSigningOut ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <LogOutIcon className="size-4" />
          )}
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AuthDialog() {
  const [open, setOpen] = React.useState(false)
  const isMobile = useIsMobile()
  const session = authClient.useSession()
  const user = session.data?.user

  if (user) {
    return <AccountMenu user={user} onSignedOut={session.refetch} />
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 cursor-pointer rounded-md text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        aria-label="Sign in"
      >
        <LogInIcon className="size-4" />
      </Button>

      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-xl">
            <SheetHeader>
              <SheetTitle>Sign in</SheetTitle>
              <SheetDescription>
                Continue with Google to use your account.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">
              <SignInContent />
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign in</DialogTitle>
              <DialogDescription>
                Continue with Google to use your account.
              </DialogDescription>
            </DialogHeader>
            <SignInContent />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
