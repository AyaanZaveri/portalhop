"use client"

import { useEffect, useLayoutEffect, useState } from "react"

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

// A phone can be wider than the desktop breakpoint when rotated. Keep those
// short, touch-first screens on the mobile TV layout so rotating does not
// replace the active player with the desktop split view.
export const TV_MOBILE_LAYOUT_QUERY =
  "(max-width: 939px), (pointer: coarse) and (max-height: 600px)"

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
