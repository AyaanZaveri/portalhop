"use client"

import * as React from "react"
import Link from "next/link"
import {
  CheckIcon,
  DicesIcon,
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

import { authClient, clearStoredSession } from "@/lib/auth-client"
import { generatedAvatarUrl, randomAvatarSeed } from "@/lib/avatar"
import { proxyImageUrl } from "@portalhop/shared/image-proxy"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  const [identifier, setIdentifier] = React.useState("")
  const [username, setUsername] = React.useState("")
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

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const result =
        mode === "signUp"
          ? await authClient.signUp.email({
            name: name.trim() || email.split("@")[0],
            email: email.trim(),
            username: username.trim(),
            password,
          })
          : identifier.includes("@")
            ? await authClient.signIn.email({
              email: identifier.trim(),
              password,
            })
            : await authClient.signIn.username({
              username: identifier.trim(),
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
        size="lg"
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

      <form className="flex flex-col gap-3" onSubmit={submitCredentials}>
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
        {mode === "signUp" ? (
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="auth-username">Username</Label>
            <Input
              id="auth-username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              maxLength={30}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="portalhopaz"
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-2.5">
          <Label htmlFor="auth-identifier">
            {mode === "signUp" ? "Email" : "Username or email"}
          </Label>
          <Input
            id="auth-identifier"
            type={mode === "signUp" ? "email" : "text"}
            autoComplete={mode === "signUp" ? "email" : "username"}
            required
            value={mode === "signUp" ? email : identifier}
            onChange={(event) =>
              mode === "signUp"
                ? setEmail(event.target.value)
                : setIdentifier(event.target.value)
            }
            placeholder={mode === "signUp" ? "you@example.com" : "portalhopaz or you@example.com"}
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
        <Button
        type="submit"
        size="lg"
        className="w-full justify-center gap-2"
        disabled={busy}
      >
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
  const { theme, setTheme } = useTheme()
  const currentTheme = theme ?? "system"
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = React.useState(false)

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

  // Touch gets a sheet built from the same pieces as the category and group
  // sheets — same surface, same header shape, same full-width actions — so the
  // account menu doesn't look like it came from a different app. The dropdown
  // below is untouched and still serves every pointer device.
  if (isMobile) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 cursor-pointer rounded-md text-muted-foreground hover:text-foreground min-[940px]:size-8"
          aria-label="Account"
          onClick={() => setMenuOpen(true)}
        >
          <UserAvatar user={user} className="size-5" />
        </Button>
        <Drawer open={menuOpen} onOpenChange={setMenuOpen} showSwipeHandle>
          <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl backdrop-blur-md [--drawer-inset:0.5rem] after:hidden dark:border">
            <div className="flex flex-col gap-4 p-4 pt-2">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar user={user} className="size-10" />
                <div className="min-w-0 flex-1">
                  <DrawerTitle className="truncate text-left">
                    {user.name || "Signed in"}
                  </DrawerTitle>
                  {user.email ? (
                    <DrawerDescription className="truncate text-left">
                      {user.email}
                    </DrawerDescription>
                  ) : null}
                </div>
              </div>

              {/* The desktop menu nests these in a submenu, which has no good
                  touch gesture. Three exclusive options fit across one row. */}
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

              <div className="flex flex-col gap-2">
                {showAvatarControls ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full justify-center gap-2"
                    disabled={isShuffling}
                    onClick={shuffleAvatar}
                  >
                    {isShuffling ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <DicesIcon />
                    )}
                    Shuffle avatar
                  </Button>
                ) : null}
                {/* Settings is the reason this sheet gets opened; signing out
                    is rare. Sharing a row keeps the sheet short, and the 2:1
                    split puts the common action under the thumb while leaving
                    sign out clearly labelled rather than a bare icon. */}
                <div className="flex gap-2">
                  {!hideSettings ? (
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full flex-[2] justify-center gap-2"
                      render={<Link href="/settings" />}
                      onClick={() => setMenuOpen(false)}
                    >
                      <SettingsIcon />
                      Settings
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full flex-1 justify-center gap-2"
                    disabled={isSigningOut}
                    onClick={signOut}
                  >
                    {isSigningOut ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <LogOutIcon />
                    )}
                    Sign out
                  </Button>
                </div>
              </div>
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
          {showAvatarControls ? (
            <DropdownMenuItem
              closeOnClick={false}
              disabled={isShuffling}
              onClick={shuffleAvatar}
              className="py-1.5"
            >
              {isShuffling ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <DicesIcon />
              )}
              <span>Shuffle avatar</span>
            </DropdownMenuItem>
          ) : null}
          {!hideSettings ? (
            <DropdownMenuItem
              render={<Link href="/settings" />}
              className="py-1.5"
            >
              <SettingsIcon />
              <span>Settings</span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="py-1.5">
              <SunMoonIcon />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
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
