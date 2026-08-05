"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Client-side rather than `redirect()`: a statically exported build has no
// server to issue the 307, so this document has to route itself.
export default function SettingsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/settings/sources")
  }, [router])

  return null
}
