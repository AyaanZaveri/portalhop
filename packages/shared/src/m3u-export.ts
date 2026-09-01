// Shared formatting for exported M3U Plus playlists (per-source and
// favorites). Kept free of DB/route imports so it can be used from any
// export route without pulling in unrelated dependencies.

export function m3uExtinf({
  xmltvId,
  displayName,
  logo,
  genre,
}: {
  xmltvId: string
  displayName: string
  logo: string
  genre: string
}) {
  const attributes = [
    `tvg-id="${escapeM3uAttribute(xmltvId)}"`,
    `tvg-name="${escapeM3uAttribute(displayName)}"`,
    `tvg-logo="${escapeM3uAttribute(logo)}"`,
    `group-title="${escapeM3uAttribute(genre)}"`,
  ].join(" ")

  // The comma must immediately follow the final attribute: it separates the
  // M3U Plus metadata from the user-visible channel name.
  return `#EXTINF:-1 ${attributes},${escapeM3uText(displayName)}`
}

export function escapeM3uAttribute(value: string) {
  return value.replace(/[\r\n"]/g, (match) => (match === '"' ? "&quot;" : " "))
}

export function escapeM3uText(value: string) {
  return value.replace(/[\r\n]/g, " ")
}

export function filenameSafe(value: string) {
  const filename = value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-|-$/g, "")
  return filename || "playlist"
}
