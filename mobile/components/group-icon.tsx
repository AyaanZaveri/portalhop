import type { ComponentType } from "react"
import {
  AudioLines,
  Baby,
  Bike,
  BookOpen,
  Bookmark,
  BriefcaseBusiness,
  Camera,
  Car,
  ChefHat,
  Church,
  Circle,
  Clapperboard,
  Compass,
  Crown,
  Disc,
  Drama,
  Dumbbell,
  Film,
  Flag,
  Flame,
  Folder,
  Gamepad2,
  Gavel,
  Globe,
  Goal,
  GraduationCap,
  Guitar,
  Headphones,
  Heart,
  House,
  IceCreamCone,
  Landmark,
  Leaf,
  Medal,
  Mic,
  MountainSnow,
  Music,
  Newspaper,
  PawPrint,
  Pin,
  Plane,
  Popcorn,
  Puzzle,
  Radio,
  RadioTower,
  Rocket,
  Rss,
  School,
  Shirt,
  ShoppingCart,
  Smile,
  Sparkles,
  Star,
  Stethoscope,
  Swords,
  Tag,
  Target,
  Theater,
  Ticket,
  TrendingUp,
  Trophy,
  TvMinimal,
  Video,
  Volleyball,
  WavesHorizontal,
  Zap,
  Icon as LucideIcon,
  type LucideProps,
} from "lucide-react-native"

// One file each, not the package root: the root is 7.4MB of icons and Metro
// does not tree-shake reliably enough to trust it. Each of these is ~700 bytes.
import basketball from "@lucide/lab/dist/esm/icons/basketball"
import football from "@lucide/lab/dist/esm/icons/football"
import baseball from "@lucide/lab/dist/esm/icons/baseball"
import tennisRacket from "@lucide/lab/dist/esm/icons/tennis-racket"
import cricketBall from "@lucide/lab/dist/esm/icons/cricket-ball"
import rugby from "@lucide/lab/dist/esm/icons/rugby"
import iceHockey from "@lucide/lab/dist/esm/icons/ice-hockey"
import golfDriver from "@lucide/lab/dist/esm/icons/golf-driver"
import bowling from "@lucide/lab/dist/esm/icons/bowling"
import motorRacingHelmet from "@lucide/lab/dist/esm/icons/motor-racing-helmet"
import horseHead from "@lucide/lab/dist/esm/icons/horse-head"
import surfboard from "@lucide/lab/dist/esm/icons/surfboard"
import skis from "@lucide/lab/dist/esm/icons/skis"

type IconNode = React.ComponentProps<typeof LucideIcon>["iconNode"]

/** Wraps a lucide-lab node as a component, the way the web's picker does. */
function lab(iconNode: IconNode): ComponentType<LucideProps> {
  return function LabIcon(props: LucideProps) {
    return <LucideIcon {...props} iconNode={iconNode} />
  }
}

/**
 * The icon a favourite group was saved with.
 *
 * Keyed by the ids the web's picker writes, so a group given the cricket icon
 * there arrives as that icon here. The map is per platform because the id is
 * what is stored — the component it resolves to cannot cross into shared code.
 *
 * Thirteen of these are lucide-lab icons rather than core lucide: the sports
 * that core does not draw, cricket among them. Three others resolve to a
 * different core component than the web uses, because lucide-react-native does
 * not ship the name lucide-react does — Waves, Podcast and Globe2.
 */
const GROUP_ICONS: Record<string, ComponentType<LucideProps>> = {
  goal: Goal,
  basketball: lab(basketball),
  gridiron: lab(football),
  baseball: lab(baseball),
  tennis: lab(tennisRacket),
  cricket: lab(cricketBall),
  rugby: lab(rugby),
  icehockey: lab(iceHockey),
  golf: lab(golfDriver),
  volleyball: Volleyball,
  bowling: lab(bowling),
  motorsport: lab(motorRacingHelmet),
  horseracing: lab(horseHead),
  surfing: lab(surfboard),
  skiing: lab(skis),
  cycling: Bike,
  swimming: WavesHorizontal,
  climbing: MountainSnow,
  darts: Target,
  combat: Swords,
  dumbbell: Dumbbell,
  trophy: Trophy,
  medal: Medal,
  racing: Flag,
  film: Film,
  clapperboard: Clapperboard,
  popcorn: Popcorn,
  tv: TvMinimal,
  theatre: Theater,
  drama: Drama,
  events: Ticket,
  video: Video,
  gamepad: Gamepad2,
  music: Music,
  radio: Radio,
  podcast: Rss,
  headphones: Headphones,
  albums: Disc,
  livemusic: Guitar,
  talk: Mic,
  audio: AudioLines,
  news: Newspaper,
  globe: Globe,
  book: BookOpen,
  education: GraduationCap,
  politics: Landmark,
  law: Gavel,
  business: BriefcaseBusiness,
  markets: TrendingUp,
  live: RadioTower,
  school: School,
  baby: Baby,
  puzzle: Puzzle,
  treats: IceCreamCone,
  animals: PawPrint,
  space: Rocket,
  fun: Smile,
  house: House,
  food: ChefHat,
  travel: Plane,
  shopping: ShoppingCart,
  fashion: Shirt,
  health: Stethoscope,
  faith: Church,
  nature: Leaf,
  cars: Car,
  photography: Camera,
  star: Star,
  heart: Heart,
  sparkles: Sparkles,
  bookmark: Bookmark,
  trending: Flame,
  quick: Zap,
  premium: Crown,
  collection: Folder,
  tag: Tag,
  pinned: Pin,
  discover: Compass,
  plain: Circle,
}

/** Star is the web's fallback for an id it does not know, so it is ours. */
export function GroupIcon({
  icon,
  size = 16,
  color,
}: {
  icon: string | undefined
  size?: number
  color: string
}) {
  const Resolved = (icon && GROUP_ICONS[icon]) || Star
  return <Resolved size={size} color={color} />
}
