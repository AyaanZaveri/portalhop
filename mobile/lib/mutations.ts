import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiFetch } from "./api"
import type { FavoriteGroup } from "./filters"

/**
 * Add or remove a favourite.
 *
 * Optimistic, because the whole point of a long press is that it feels
 * immediate — a star that waits for a round trip before filling reads as a
 * missed tap. The cache is rolled back if the request fails.
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      channelKey,
      favorited,
    }: {
      channelKey: string
      favorited: boolean
    }) => {
      const response = favorited
        ? await apiFetch(
            `/api/favorites?channelKey=${encodeURIComponent(channelKey)}`,
            { method: "DELETE" },
          )
        : await apiFetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channelKey }),
          })

      if (!response.ok) throw new Error("Could not update favourites.")
    },

    onMutate: async ({ channelKey, favorited }) => {
      // Otherwise a refetch already in flight can land after this and put the
      // old list back.
      await queryClient.cancelQueries({ queryKey: ["favorites"] })
      const previous = queryClient.getQueryData<{ favorites: string[] }>([
        "favorites",
      ])

      queryClient.setQueryData<{ favorites: string[] }>(["favorites"], (current) => {
        const keys = current?.favorites ?? []
        return {
          favorites: favorited
            ? keys.filter((key) => key !== channelKey)
            : // Appended, not prepended: the list is in the user's manual
              // order and a new favourite belongs at the end of it.
              [...keys, channelKey],
        }
      })

      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["favorites"], context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] })
    },
  })
}

/** Add or remove a channel from one favourite group. Optimistic for the same reason. */
export function useToggleGroupMembership() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      groupId,
      channelKey,
      member,
    }: {
      groupId: number
      channelKey: string
      member: boolean
    }) => {
      const response = await apiFetch(
        `/api/favorite-groups/${groupId}/channels`,
        {
          method: member ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          // The handler reads the key from the body on both verbs.
          body: JSON.stringify({ channelKey }),
        },
      )

      if (!response.ok) throw new Error("Could not update the group.")
    },

    onMutate: async ({ groupId, channelKey, member }) => {
      await queryClient.cancelQueries({ queryKey: ["favorite-groups"] })
      const previous = queryClient.getQueryData<{ groups: FavoriteGroup[] }>([
        "favorite-groups",
      ])

      queryClient.setQueryData<{ groups: FavoriteGroup[] }>(
        ["favorite-groups"],
        (current) => ({
          groups: (current?.groups ?? []).map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  channelKeys: member
                    ? group.channelKeys.filter((key) => key !== channelKey)
                    : [...group.channelKeys, channelKey],
                }
              : group,
          ),
        }),
      )

      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["favorite-groups"], context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorite-groups"] })
    },
  })
}
