import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"

export type SessionUser = {
  id: string
  email: string
  name: string
}

/** Returns the signed-in user for the current request, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    return null
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  }
}

/**
 * Route-handler guard: returns the signed-in user, or a 401 response to return
 * directly. Usage: `const user = await requireUser(); if (user instanceof NextResponse) return user`.
 */
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser()

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  }

  return user
}
