// Re-export so screens import channel identity from one obvious place, and so
// swapping in a userId-aware slug later touches this file rather than each call
// site. The implementation is shared with the web app on purpose — favourite
// keys and deep links have to match between the two.
export {
  buildChannelIndex,
  getChannelKey,
  getLegacyChannelKey,
  type ChannelWithSourceId,
} from "@portalhop/shared/channel-keys"

import { channelSlug as sharedChannelSlug } from "@portalhop/shared/channel-keys"
import type { ChannelWithSourceId } from "@portalhop/shared/channel-keys"

/**
 * The web app scopes slugs per user. Until the session id is threaded through
 * here, "anon" is used — which the shared implementation already falls back to,
 * so the two agree as long as both pass the same thing. Revisit when favourites
 * land, since a mismatch would break deep links between the clients.
 */
export function channelSlug(
  channel: ChannelWithSourceId,
  trusted: ReadonlySet<string>,
  userId?: string | null,
) {
  return sharedChannelSlug(channel, userId ?? null, trusted)
}
