import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { ChannelSourceOrder } from "@portalhop/shared/channel-grouping"

import { apiFetch, apiJson } from "./api"

const KEY = ["channel-source-order"]

const EMPTY: ChannelSourceOrder = {}

/**
 * Which stream each channel plays, as the user has chosen it.
 *
 * One small sparse table — a row only where somebody has actually chosen — so
 * it is read whole and kept for the session. The web reads the same endpoint
 * and the two must agree: a default picked on one client is the channel's
 * default, not that client's.
 */
export function useChannelSourceOrder(enabled: boolean) {
  const query = useQuery({
    queryKey: KEY,
    queryFn: () =>
      apiJson<{ order: ChannelSourceOrder }>("/api/channel-source-order"),
    select: (data) => data.order,
    enabled,
  })

  return query.data ?? EMPTY
}

/**
 * Promotes one stream to the front of its channel's order.
 *
 * The whole order goes up rather than the one id, because that is what the
 * server stores and what the next reader has to agree with. Optimistic: the
 * answer is already known — the user tapped a row — and a list that ignores
 * the tap until the network agrees is the wrong way round for a preference.
 */
export function useChooseChannelSource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      identityKey,
      savedChannelIds,
    }: {
      identityKey: string
      savedChannelIds: number[]
    }) => {
      const response = await apiFetch("/api/channel-source-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityKey, savedChannelIds }),
      })

      if (!response.ok) throw new Error("Could not save the default source.")
    },

    onMutate: async ({ identityKey, savedChannelIds }) => {
      await queryClient.cancelQueries({ queryKey: KEY })
      const previous = queryClient.getQueryData<{ order: ChannelSourceOrder }>(
        KEY,
      )

      queryClient.setQueryData<{ order: ChannelSourceOrder }>(
        KEY,
        (current) => ({
          order: { ...(current?.order ?? {}), [identityKey]: savedChannelIds },
        }),
      )

      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(KEY, context.previous)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: KEY })
    },
  })
}
