// The contract between shared logic and whichever app is hosting it.
//
// Interfaces only, deliberately: shared code must never branch on the platform.
// Conditional imports or `Platform.OS` checks in here would make the Next static
// export drag React Native modules into its bundle, and vice versa. Each app
// constructs an adapter at its root and passes it down.

/** A `fetch` already bound to the API's base URL and the caller's session. */
export interface ApiFetch {
  (path: string, init?: RequestInit): Promise<Response>
}

/** Async key/value storage. Web: localStorage. Native: MMKV. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

/**
 * Storage for credentials. Separate from KeyValueStore by intent rather than by
 * shape: on native this is the keychain/keystore, and the distinction is the
 * only thing stopping a session token being written somewhere readable.
 */
export type SecureStore = KeyValueStore

export type HapticStrength = "light" | "medium"

export interface Haptics {
  impact(strength: HapticStrength): void
}

export interface Clipboard {
  write(text: string): Promise<void>
}

/**
 * Cache for a source's channel catalogue.
 *
 * Exists so `loadPortalChannels` can stay in shared: the web backs this with
 * IndexedDB and native with SQLite, and neither implementation can live here.
 * Entries are invalidated by comparing the source's `updatedAt`, not by a TTL —
 * a catalogue is correct until the source itself changes.
 */
export interface PortalChannelCacheEntry<TChannel> {
  sourceId: number
  updatedAt: string | null
  channels: TChannel[]
}

export interface PortalChannelCache<TChannel> {
  get(sourceId: number): Promise<PortalChannelCacheEntry<TChannel> | null>
  set(entry: PortalChannelCacheEntry<TChannel>): Promise<void>
  /** Drops every cached source except those listed, e.g. after a sign-out. */
  prune(keepSourceIds: number[]): Promise<void>
}

/** Everything shared logic needs from its host. */
export interface PlatformAdapter<TChannel = unknown> {
  apiFetch: ApiFetch
  storage: KeyValueStore
  secureStorage: SecureStore
  haptics: Haptics
  clipboard: Clipboard
  portalChannelCache: PortalChannelCache<TChannel>
}
