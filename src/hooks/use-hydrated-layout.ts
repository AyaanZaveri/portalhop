"use client"

import { useEffect, useLayoutEffect, useState } from "react"

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

export function useHydratedLayout() {
  const [isReady, setIsReady] = useState(false)

  useBrowserLayoutEffect(() => {
    setIsReady(true)
  }, [])

  return isReady
}
