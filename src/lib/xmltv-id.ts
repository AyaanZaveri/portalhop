/**
 * Some portals append a quality/language tag to their tvg-id / xmltv_id
 * values (e.g. "TSN1.ca@SD", "CNN@HD"). Real XMLTV `<channel id>` values never
 * carry that suffix, so an exact-match lookup against EPG data has to strip
 * it first or it silently misses (no logo, no programme guide).
 */
export function normalizeXmltvId(id: string | undefined | null): string {
  return (id ?? "")
    .trim()
    .replace(/\s*@[^@\s]+$/, "")
    .trim()
    .toLowerCase()
}
