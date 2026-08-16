import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { StreamInfo } from "@portalhop/shared/stream-info"

import { apiFetch, apiJson } from "./api"

const KEY = ["stream-info"]

const EMPTY: Record<number, StreamInfo> = {}

/**
 * What each of this user's streams turned out to be, by saved channel id.
 *
 * Sparse: a row only where a stream has been watched. The sources sheet reads
 * it so a viewer choosing between five copies of a channel can see which of
 * them is the 4K one before opening it.
 */
export function useStreamInfo(enabled: boolean) {
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => apiJson<{ info: Record<number, StreamInfo> }>("/api/stream-info"),
    select: (data) => data.info,
    enabled,
  })

  return query.data ?? EMPTY
}

/**
 * Records what the player just saw.
 *
 * Fire and forget, and deliberately quiet: this is a by-product of watching
 * television, not an action anyone took, so a failed write is worth nothing on
 * screen. The next play reports again.
 */
export function useRecordStreamInfo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      info: StreamInfo & { savedChannelId: number },
    ) => {
      await apiFetch("/api/stream-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(info),
      })
    },
    onSuccess: (_data, variables) => {
      // Patched in place rather than refetched: the map is the user's own
      // readings, and the one that just changed is the one in hand.
      queryClient.setQueryData<{ info: Record<number, StreamInfo> }>(
        KEY,
        (current) => ({
          info: {
            ...(current?.info ?? {}),
            [variables.savedChannelId]: variables,
          },
        }),
      )
    },
  })
}
