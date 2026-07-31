"use client"

import { useEffect, useLayoutEffect, useState } from "react"

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

export function useMediaQuery(query: string, defaultMatches = false) {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined"
      ? defaultMatches
      : window.matchMedia(query).matches,
  )

  useBrowserLayoutEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const handleChange = () => setMatches(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener("change", handleChange)

    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [query])

  return matches
}
