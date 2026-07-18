import { Icon } from "lucide-react"

import { cn } from "@/lib/utils"
import { resolveProgrammeCategoryIcon } from "@/lib/programme-category-icons"

export function ProgrammeCategoryIcon({
  category,
  className,
}: {
  category: string
  className?: string
}) {
  const visual = resolveProgrammeCategoryIcon(category)

  if (!visual) {
    return null
  }

  if (visual.kind === "lab") {
    return (
      <Icon
        iconNode={visual.iconNode}
        className={cn("size-3 shrink-0", className)}
      />
    )
  }

  const LucideIcon = visual.icon

  return (
    <LucideIcon
      className={cn("text-muted-foreground size-3 shrink-0", className)}
    />
  )
}
