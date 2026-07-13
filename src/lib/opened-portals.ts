const openedPortalsStorageKey = "portalhop-opened-portal-ids"
const lastOpenedPortalStorageKey = "portalhop-last-opened-portal-id"

export function readOpenedPortalIds() {
  if (typeof window === "undefined") {
    return []
  }

  const storedValue = localStorage.getItem(openedPortalsStorageKey)

  if (!storedValue) {
    return []
  }

  try {
    const parsed = JSON.parse(storedValue)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value))
  } catch {
    return []
  }
}

export function persistOpenedPortalIds(portalIds: number[]) {
  if (typeof window === "undefined") {
    return
  }

  const uniqueIds = [...new Set(portalIds)].filter((id) =>
    Number.isInteger(id)
  )

  if (uniqueIds.length) {
    localStorage.setItem(openedPortalsStorageKey, JSON.stringify(uniqueIds))
    localStorage.setItem(
      lastOpenedPortalStorageKey,
      String(uniqueIds[uniqueIds.length - 1])
    )
    return
  }

  localStorage.removeItem(openedPortalsStorageKey)
  localStorage.removeItem(lastOpenedPortalStorageKey)
}

export function getLastOpenedPortalId() {
  if (typeof window === "undefined") {
    return null
  }

  return localStorage.getItem(lastOpenedPortalStorageKey)
}

export function setLastOpenedPortalId(portalId: number) {
  if (typeof window === "undefined") {
    return
  }

  localStorage.setItem(lastOpenedPortalStorageKey, String(portalId))
}
