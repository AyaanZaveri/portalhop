"use client"

import * as React from "react"
import { LogInIcon, Loader2Icon } from "lucide-react"
import { siGoogle } from "simple-icons"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
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

export function AuthDialog() {
  const [open, setOpen] = React.useState(false)
  const isMobile = useIsMobile()

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
