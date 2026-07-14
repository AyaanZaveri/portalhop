import { RabbitIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function PortalHopWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-xl", className)}>
      <span className="font-[family-name:var(--font-montserrat)] text-xl tracking-tight">
        <span className="font-semibold">Portal</span>
        <span className="font-light">Hop</span>
      </span>
      <RabbitIcon className="size-6 text-primary brightness-75 dark:brightness-100" />
    </div>
  )
}
