export type BrowseFilter =
  | { type: "favorites" }
  | { type: "all" }
  | { type: "category"; genre: string; sourceId?: number }
  | { type: "favoriteGroup"; groupId: number }

export const browseFilterCookieName = "portalhop-browse-filter"

export function parseBrowseFilter(value: string | undefined): BrowseFilter | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value))
    if (parsed?.type === "all" || parsed?.type === "favorites") return parsed
    if (parsed?.type === "category" && typeof parsed.genre === "string") return parsed
    if (parsed?.type === "favoriteGroup" && Number.isInteger(parsed.groupId)) return parsed
  } catch {}
  return null
}
