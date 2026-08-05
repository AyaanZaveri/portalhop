"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Client-side rather than `redirect()`: a statically exported build has no
// server to issue the 307, so the entry document has to route itself.
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/tv")
  }, [router])

  return null
}
