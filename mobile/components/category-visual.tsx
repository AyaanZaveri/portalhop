import { Image } from "expo-image"
import {
  Baby,
  Church,
  CircleSlash2,
  Clapperboard,
  Crown,
  Globe,
  GraduationCap,
  Lock,
  Music,
  Newspaper,
  Radio,
  Sparkles,
  Tag,
  Trophy,
  type LucideProps,
} from "lucide-react-native"
import type { ComponentType } from "react"

import {
  circleFlagUrl,
  resolveCategoryVisual,
  type CategoryIcon,
} from "@portalhop/shared/category-flags"

// The same mapping the web's CategoryVisual uses. It lives per-platform because
// the shared resolver deliberately returns an icon *name* rather than a
// component — that is what lets one classifier serve both apps.
const CATEGORY_ICONS: Record<CategoryIcon, ComponentType<LucideProps>> = {
  sports: Trophy,
  movies: Clapperboard,
  kids: Baby,
  music: Music,
  radio: Radio,
  news: Newspaper,
  documentary: GraduationCap,
  entertainment: Sparkles,
  religious: Church,
  adult: Lock,
  vip: Crown,
  region: Globe,
  unknown: CircleSlash2,
}

export function CategoryVisual({
  category,
  size = 16,
  color,
}: {
  category: string
  size?: number
  /**
   * Required rather than defaulted, because the right answer depends on what
   * the icon sits next to.
   *
   * It labels the category beside it, so it should read as one thing with that
   * word rather than as an accent of its own — in the primary next to muted
   * text it was louder than the label it belongs to, and down a list of rows
   * that became a column of colour competing with the channel names. Flags are
   * unaffected: they are images, and their colour is the point.
   */
  color: string
}) {
  const visual = resolveCategoryVisual(category)

  if (visual?.kind === "flag") {
    return (
      <Image
        source={{ uri: circleFlagUrl(visual.code) }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        // Flags are SVG and identical across every row that shows them, so the
        // cache does real work here. No transition: these sit in a recycled
        // list, where a fade reads as a glitch.
        cachePolicy="memory-disk"
        recyclingKey={visual.code}
        transition={0}
      />
    )
  }

  const Icon = visual?.kind === "icon" ? CATEGORY_ICONS[visual.icon] : Tag
  return <Icon size={size} color={color} />
}
