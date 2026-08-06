"use client"

import * as React from "react"
import Link from "next/link"
import {
  DicesIcon,
  LogInIcon,
  Loader2Icon,
  LogOutIcon,
  SettingsIcon,
} from "lucide-react"
import { toast } from "sonner"

import { authClient, clearStoredSession } from "@/lib/auth-client"
import { generatedAvatarUrl, randomAvatarSeed } from "@/lib/avatar"
import { proxyImageUrl } from "@/lib/image-proxy"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuGroup,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu"
import { ThemeSegmentedControl } from "@/components/theme-segmented-control"
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

function UserAvatar({
  user,
  className = "size-6",
}: {
  user: SessionUser
  className?: string
}) {
  // Every avatar is a URL: a stored photo (Google, a shuffled DiceBear avatar,
  // or a future upload) when present, otherwise a DiceBear avatar generated
  // from the stable account id so it's consistent per user without any write.
  // Route it through wsrv.nl for edge caching, like the channel logos.
  const src =
    user.image ||
    generatedAvatarUrl(user.id || user.email || user.name || "portalhop")

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxyImageUrl(src)}
      alt=""
      className={`${className} shrink-0 rounded-full bg-muted object-cover`}
      referrerPolicy="no-referrer"
    />
  )
}

function AccountMenu({
  user,
  onSignedOut,
  onProfileUpdated,
  hideSettings,
  showAvatarControls,
}: {
  user: SessionUser
  onSignedOut: () => Promise<void>
  onProfileUpdated: () => Promise<void>
  hideSettings: boolean
  showAvatarControls: boolean
}) {
  const [isSigningOut, setIsSigningOut] = React.useState(false)
  const [isShuffling, setIsShuffling] = React.useState(false)

  async function signOut() {
    setIsSigningOut(true)

    try {
      await authClient.signOut()
      // The mobile build authenticates with a stored bearer token rather than
      // a cookie, so signing out has to drop it explicitly.
      clearStoredSession()
      await onSignedOut()
      toast.success("Signed out")
    } catch (error) {
      console.error(error)
      toast.error("Could not sign out.")
    } finally {
      setIsSigningOut(false)
    }
  }

  async function shuffleAvatar() {
    setIsShuffling(true)

    try {
      const { error } = await authClient.updateUser({
        image: generatedAvatarUrl(randomAvatarSeed()),
      })

      if (error) {
        throw new Error(error.message)
      }

      await onProfileUpdated()
    } catch (error) {
      console.error(error)
      toast.error("Could not update your avatar.")
    } finally {
      setIsShuffling(false)
    }
  }

  return (
    <ResponsiveMenu>
      <ResponsiveMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-9 cursor-pointer rounded-md text-muted-foreground hover:text-foreground min-[940px]:size-8"
            aria-label="Account"
          />
        }
      >
        <UserAvatar user={user} className="size-5" />
      </ResponsiveMenuTrigger>
      <ResponsiveMenuContent align="end" title="Account" className="w-60">
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
        <ResponsiveMenuSeparator />
        {/* A segmented control rather than the submenu this used to be: the
            active theme is visible without opening anything, and switching is
            one tap instead of two — which mattered most on touch, where a
            submenu has no good gesture at all. */}
        <div className="px-1 py-1.5">
          <ThemeSegmentedControl />
        </div>
        <ResponsiveMenuSeparator />
        <ResponsiveMenuGroup>
          {showAvatarControls ? (
            <ResponsiveMenuItem
              closeOnClick={false}
              disabled={isShuffling}
              onClick={shuffleAvatar}
            >
              {isShuffling ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <DicesIcon />
              )}
              <span>Shuffle avatar</span>
            </ResponsiveMenuItem>
          ) : null}
          {!hideSettings ? (
            <ResponsiveMenuItem render={<Link href="/settings" />}>
              <SettingsIcon />
              <span>Settings</span>
            </ResponsiveMenuItem>
          ) : null}
        </ResponsiveMenuGroup>
        <ResponsiveMenuSeparator />
        <ResponsiveMenuItem disabled={isSigningOut} onClick={signOut}>
          {isSigningOut ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <LogOutIcon />
          )}
          Sign out
        </ResponsiveMenuItem>
      </ResponsiveMenuContent>
    </ResponsiveMenu>
  )
}

export function AuthDialog({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  hideSettings = false,
  showAvatarControls = false,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
  hideSettings?: boolean
  showAvatarControls?: boolean
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
      <AccountMenu
        user={user}
        onSignedOut={session.refetch}
        onProfileUpdated={session.refetch}
        hideSettings={hideSettings}
        showAvatarControls={showAvatarControls}
      />
    )
  }

  return (
    <>
      {hideTrigger ? null : (
        <Button
          variant="ghost"
          size="icon"
          className="size-9 cursor-pointer rounded-md text-muted-foreground hover:text-foreground min-[940px]:size-8"
          onClick={() => setOpen(true)}
          aria-label="Sign in"
        >
          <LogInIcon className="size-4" />
        </Button>
      )}

      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
          <DrawerContent className="[--drawer-inset:0.5rem] rounded-xl dark:border after:hidden">
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
