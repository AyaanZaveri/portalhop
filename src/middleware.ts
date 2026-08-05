import { NextResponse, type NextRequest } from "next/server"

import { isMobileAppOrigin } from "@/lib/mobile-origins"

// The packaged mobile app calls these same routes from a different origin, so
// the API needs CORS. Browsers on the web build are same-origin and never send
// an Origin header we'd match here, so this is inert for them.
export const config = {
  matcher: "/api/:path*",
}

const allowedHeaders = "Authorization, Content-Type"
// `set-auth-token` is how better-auth's bearer plugin hands the session token
// to the mobile client; without exposing it the webview can't read it.
const exposedHeaders = "set-auth-token"

function applyCors(response: NextResponse, origin: string) {
  response.headers.set("Access-Control-Allow-Origin", origin)
  response.headers.set("Access-Control-Allow-Credentials", "true")
  response.headers.set("Access-Control-Expose-Headers", exposedHeaders)
  // Origin-dependent responses must not be cached under a single key.
  response.headers.append("Vary", "Origin")
  return response
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (!isMobileAppOrigin(origin)) return NextResponse.next()

  if (request.method === "OPTIONS") {
    const preflight = new NextResponse(null, { status: 204 })
    preflight.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    )
    preflight.headers.set("Access-Control-Allow-Headers", allowedHeaders)
    preflight.headers.set("Access-Control-Max-Age", "86400")
    return applyCors(preflight, origin)
  }

  return applyCors(NextResponse.next(), origin)
}
