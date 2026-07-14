import type { LucideIcon } from "lucide-react"

export function SettingsHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <Icon className="size-5.5 -mt-0.5 shrink-0 text-primary brightness-75 dark:brightness-100" />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
      </div>
      {description ? (
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
