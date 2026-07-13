const favoritesStorageKey = "portalhop-favorite-channels"

type Listener = (favorites: Set<string>) => void

let cache: Set<string> | null = null
const listeners = new Set<Listener>()

function read(): Set<string> {
  if (cache) {
    return cache
  }

  if (typeof window === "undefined") {
    cache = new Set()
    return cache
  }

  try {
    const stored = localStorage.getItem(favoritesStorageKey)
    const parsed = stored ? JSON.parse(stored) : []
    cache = new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    cache = new Set()
  }

  return cache
}

function write(next: Set<string>) {
  cache = next

  if (typeof window !== "undefined") {
    localStorage.setItem(favoritesStorageKey, JSON.stringify([...next]))
  }

  for (const listener of listeners) {
    listener(next)
  }
}

export function getFavorites(): Set<string> {
  return read()
}

export function isFavorite(channelKey: string): boolean {
  return read().has(channelKey)
}

export function toggleFavorite(channelKey: string) {
  const next = new Set(read())

  if (next.has(channelKey)) {
    next.delete(channelKey)
  } else {
    next.add(channelKey)
  }

  write(next)
}

export function subscribeToFavorites(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
