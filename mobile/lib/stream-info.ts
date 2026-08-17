import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  withNewReading,
  type StreamInfo,
} from "@portalhop/shared/stream-info"

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
  return useStreamInfoQuery(enabled).info
}

/**
 * The same map, and whether it has actually arrived yet.
 *
 * An empty map and a map that has not loaded look identical to a reader, and
 * for the sheet that is fine -- it draws nothing either way. For the player it
 * is the whole question: reporting before the read lands means reporting
 * without knowing what is already on file, which is a write that can only
 * repeat what the table says or, on a cold start, race it.
 */
export function useStreamInfoQuery(enabled: boolean) {
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => apiJson<{ info: Record<number, StreamInfo> }>("/api/stream-info"),
    select: (data) => data.info,
    enabled,
  })

  return { info: query.data ?? EMPTY, loaded: query.data !== undefined }
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
        (current) => {
          /**
           * Nothing patched until the map has arrived.
           *
           * A player reports within a second or two of opening a channel,
           * which is easily before the first fetch resolves -- and building a
           * map from `current ?? {}` then stands one entry up as the whole
           * table. Every other stream loses its figures on screen until
           * something refetches, which is a fair description of the sheet
           * showing a lone resolution for a channel the browser had measured
           * in full.
           *
           * The read already on its way carries the server's answer, which
           * includes this write. There is nothing here worth racing it with.
           */
          if (!current) return current

          // Merged the way the table merges it. The phone measures nothing --
          // it reports what its video track declares and nulls for the rest --
          // so replacing the entry outright would wipe a frame rate the
          // browser counted, on screen and then, on the next read, for real.
          return {
            info: {
              ...current.info,
              [variables.savedChannelId]: withNewReading(
                current.info[variables.savedChannelId],
                variables,
              ),
            },
          }
        },
      )
    },
  })
}
