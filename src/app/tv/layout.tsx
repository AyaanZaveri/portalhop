import type { ReactNode } from "react"

import { TvProvider } from "@/components/tv/tv-provider"
import { TvShell } from "@/components/tv/tv-shell"

export default function TvLayout({ children }: { children: ReactNode }) {
  return (
    <TvProvider>
      <TvShell>{children}</TvShell>
    </TvProvider>
  )
}
