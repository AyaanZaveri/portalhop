import {
  BabyIcon,
  CircleSlash2Icon,
  ClapperboardIcon,
  CrownIcon,
  GlobeIcon,
  GraduationCapIcon,
  LockIcon,
  MusicIcon,
  NewspaperIcon,
  RadioIcon,
  ChurchIcon,
  SparklesIcon,
  TagIcon,
  TrophyIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  circleFlagUrl,
  resolveCategoryVisual,
  type CategoryIcon,
} from "@/lib/category-flags"

const CATEGORY_ICONS: Record<CategoryIcon, LucideIcon> = {
  sports: TrophyIcon,
  movies: ClapperboardIcon,
  kids: BabyIcon,
  music: MusicIcon,
  radio: RadioIcon,
  news: NewspaperIcon,
  documentary: GraduationCapIcon,
  entertainment: SparklesIcon,
  religious: ChurchIcon,
  adult: LockIcon,
  vip: CrownIcon,
  region: GlobeIcon,
  unknown: CircleSlash2Icon,
}

export function CategoryVisual({
  category,
  className,
  iconClassName,
}: {
  category: string
  className?: string
  iconClassName?: string
}) {
  const visual = resolveCategoryVisual(category)

  if (visual?.kind === "flag") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Circle flags load from the hatscripts CDN.
      <img
        src={circleFlagUrl(visual.code)}
        alt=""
        className={cn("size-4 shrink-0 rounded-full object-cover", className)}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }

  const Icon = visual?.kind === "icon" ? CATEGORY_ICONS[visual.icon] : TagIcon

  return (
    <Icon
      className={cn(
        "size-4 shrink-0 text-muted-foreground",
        className,
        iconClassName,
      )}
    />
  )
}
