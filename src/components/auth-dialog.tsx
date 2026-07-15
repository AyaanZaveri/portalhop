"use client"

import * as React from "react"
import Link from "next/link"
import Avatar from "boring-avatars"
import {
  CheckIcon,
  LaptopMinimalIcon,
  LogInIcon,
  Loader2Icon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  SunMoonIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"

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
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/google.svg" alt="" aria-hidden="true" className="size-4 shrink-0" />
  )
}

function SignInContent({ onSignedIn }: { onSignedIn?: () => void }) {
  const [isSigningIn, setIsSigningIn] = React.useState(false)
  const [mode, setMode] = React.useState<"signIn" | "signUp">("signIn")
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)

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

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const result =
        mode === "signUp"
          ? await authClient.signUp.email({
            name: name.trim() || email.split("@")[0],
            email: email.trim(),
            password,
          })
          : await authClient.signIn.email({
            email: email.trim(),
            password,
          })

      if (result.error) {
        toast.error(
          result.error.message ??
          (mode === "signUp"
            ? "Could not create account."
            : "Could not sign in.")
        )
        return
      }

      toast.success(mode === "signUp" ? "Account created" : "Signed in")
      onSignedIn?.()
    } catch (error) {
      console.error(error)
      toast.error("Something went wrong. Try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const busy = isSigningIn || isSubmitting

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-center gap-2"
        disabled={busy}
        onClick={signInWithGoogle}
      >
        {isSigningIn ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Sign in with Google
      </Button>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <form className="flex flex-col gap-3" onSubmit={submitEmail}>
        {mode === "signUp" ? (
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="auth-name">Name</Label>
            <Input
              id="auth-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jane Doe"
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-2.5">
          <Label htmlFor="auth-email">Email</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="flex flex-col gap-2.5">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <Button type="submit" className="w-full justify-center gap-2" disabled={busy}>
          {isSubmitting ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : null}
          {mode === "signUp" ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signUp" ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          type="button"
          className="font-medium text-foreground underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "signUp" ? "signIn" : "signUp")}
        >
          {mode === "signUp" ? "Sign in" : "Sign up"}
        </button>
      </p>
    </div>
  )
}

type SessionUser = {
  id?: string | null
  name?: string | null
  email?: string | null
  image?: string | null
}

// Marble palette drawn from Tailwind hues adjacent to the app's lime accent —
// a warm-to-cool sweep of amber, lime, emerald, cyan, and sky (all 400).
const AVATAR_COLORS = ["#fbbf24", "#a3e635", "#34d399", "#22d3ee", "#38bdf8"]

function UserAvatar({
  user,
  className = "size-6",
}: {
  user: SessionUser
  className?: string
}) {
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

  // No profile photo: fall back to a marble avatar. Seeding by the stable
  // account id (then email/name) keeps each user's avatar consistent — it's
  // saved for the user by virtue of being deterministic from their account.
  const seed = user.id || user.email || user.name || "portalhop"

  // Size the SVG directly via className. Marble is already circular (its own
  // mask), so no wrapper/overflow is needed — wrapping it and relying on the
  // svg's 100% size let its intrinsic 80x80 viewBox win inside a flex parent,
  // which cropped it to the top-left.
  return (
    <Avatar
      size="100%"
      name={seed}
      variant="marble"
      colors={AVATAR_COLORS}
      title={false}
      className={`${className} block shrink-0 rounded-full`}
    />
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
          <DropdownMenuItem
            render={<Link href="/settings" />}
            className="py-1.5"
          >
            <SettingsIcon />
            <span>Settings</span>
          </DropdownMenuItem>
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

export function AuthDialog({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
} = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const isMobile = useIsMobile()
  const session = authClient.useSession()
  const user = session.data?.user

  const handleSignedIn = React.useCallback(() => {
    setOpen(false)
    session.refetch()
  }, [session, setOpen])

  if (user) {
    return hideTrigger ? null : (
      <AccountMenu user={user} onSignedOut={session.refetch} />
    )
  }

  return (
    <>
      {hideTrigger ? null : (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 cursor-pointer rounded-md text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(true)}
          aria-label="Sign in"
        >
          <LogInIcon className="size-4" />
        </Button>
      )}

      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
          <DrawerContent className="[--drawer-inset:0.5rem] rounded-xl border after:hidden">
            <DrawerHeader>
              <DrawerTitle>Sign in</DrawerTitle>
              <DrawerDescription>
                Use Google or an email and password to continue.
              </DrawerDescription>
            </DrawerHeader>
            <div className="p-4">
              <SignInContent onSignedIn={handleSignedIn} />
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign in</DialogTitle>
              <DialogDescription>
                Use Google or an email and password to continue.
              </DialogDescription>
            </DialogHeader>
            <SignInContent onSignedIn={handleSignedIn} />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
