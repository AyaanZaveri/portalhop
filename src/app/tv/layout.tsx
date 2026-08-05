"use client"

import { Suspense, useState, type ReactNode } from "react"

import { TvProvider } from "@/components/tv/tv-provider"
import { TvShell } from "@/components/tv/tv-shell"
import { browseFilterCookieName, parseBrowseFilter } from "@/lib/browse-filter"

// Read on the client rather than through `next/headers`: a statically exported
// build has no request to read cookies from, and the packaged mobile app is
// served off disk. Reading during the first render (rather than in an effect)
// keeps the filter applied on the initial paint, as the server version did.
function readBrowseFilterCookie() {
  if (typeof document === "undefined") return null
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${browseFilterCookieName}=`))
  return parseBrowseFilter(entry?.slice(browseFilterCookieName.length + 1))
}

export default function TvLayout({ children }: { children: ReactNode }) {
  const [initialBrowseFilter] = useState(readBrowseFilterCookie)

  return (
    <TvProvider initialBrowseFilter={initialBrowseFilter}>
      {/* TvShell and the page both read the `?channel=` param, which Next
          requires to sit under a Suspense boundary to prerender this route. */}
      <Suspense>
        <TvShell>{children}</TvShell>
      </Suspense>
    </TvProvider>
  )
}
