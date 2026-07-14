"use client"

import * as React from "react"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import {
  getFavorites,
  loadFavoritesForUser,
  loadLocalFavorites,
  subscribeToFavorites,
  toggleFavorite as toggleFavoriteRemote,
  toggleFavoriteLocal,
} from "@/lib/favorites"

/**
 * Keeps the favorites cache in sync with the signed-in user. Call this once near
 * the app root so favorites load (and local ones migrate) even before any portal
 * is opened. Safe to call from multiple places — loads are de-duped.
 */
export function useFavoritesSync() {
  const { data } = authClient.useSession()
  const userId = data?.user?.id ?? null

  React.useEffect(() => {
    if (userId) {
      loadFavoritesForUser(userId)
    } else {
      loadLocalFavorites()
    }
  }, [userId])

  return userId
}

export function useFavorites() {
  const userId = useFavoritesSync()

  const favorites = React.useSyncExternalStore(
    subscribeToFavorites,
    getFavorites,
    () => EMPTY
  )

  const isFavorite = React.useCallback(
    (channelKey: string) => favorites.has(channelKey),
    [favorites]
  )

  const toggleFavorite = React.useCallback(
    (channelKey: string) => {
      if (!userId) {
        // Signed out: keep favorites on the device; they migrate to the
        // account on the next sign-in.
        toggleFavoriteLocal(channelKey)
        return
      }

      toggleFavoriteRemote(channelKey).catch(() => {
        toast.error("Could not update favorite.")
      })
    },
    [userId]
  )

  return { favorites, isFavorite, toggleFavorite }
}

const EMPTY = new Set<string>()
