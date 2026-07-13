"use client"

import * as React from "react"
import {
  getFavorites,
  subscribeToFavorites,
  toggleFavorite,
} from "@/lib/favorites"

export function useFavorites() {
  const favorites = React.useSyncExternalStore(
    subscribeToFavorites,
    getFavorites,
    () => EMPTY
  )

  const isFavorite = React.useCallback(
    (channelKey: string) => favorites.has(channelKey),
    [favorites]
  )

  return { favorites, isFavorite, toggleFavorite }
}

const EMPTY = new Set<string>()
