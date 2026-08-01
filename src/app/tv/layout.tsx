import type { ReactNode } from "react"
import { cookies } from "next/headers"

import { TvProvider } from "@/components/tv/tv-provider"
import { TvShell } from "@/components/tv/tv-shell"
import { browseFilterCookieName, parseBrowseFilter } from "@/lib/browse-filter"

export default async function TvLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const initialBrowseFilter = parseBrowseFilter(
    cookieStore.get(browseFilterCookieName)?.value,
  )

  return (
    <TvProvider initialBrowseFilter={initialBrowseFilter}>
      <TvShell>{children}</TvShell>
    </TvProvider>
  )
}
