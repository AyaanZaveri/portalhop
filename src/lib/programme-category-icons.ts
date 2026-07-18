// Maps XMLTV `<category>` genre tags (e.g. "Golf", "Crime drama", "Cooking")
// to a semantic icon. These are much finer-grained than the channel-level
// genres handled by category-flags.ts, so they get their own resolver.
//
// Some genres (specific sports in particular) don't have a good match in the
// core lucide-react set, so those fall back to @lucide/lab icon nodes,
// rendered via lucide-react's <Icon iconNode={...} /> escape hatch.

import {
  AwardIcon,
  BabyIcon,
  BookOpenIcon,
  BriefcaseBusinessIcon,
  ChefHatIcon,
  ChurchIcon,
  ClapperboardIcon,
  CloudSunIcon,
  DumbbellIcon,
  FlaskConicalIcon,
  Gamepad2Icon,
  GavelIcon,
  GhostIcon,
  GraduationCapIcon,
  HeartIcon,
  HouseIcon,
  LandmarkIcon,
  LaughIcon,
  LockIcon,
  MedalIcon,
  MicIcon,
  MusicIcon,
  NewspaperIcon,
  PawPrintIcon,
  PlaneIcon,
  RocketIcon,
  SailboatIcon,
  ShirtIcon,
  ShoppingCartIcon,
  SparklesIcon,
  StethoscopeIcon,
  SwordsIcon,
  TargetIcon,
  TheaterIcon,
  TrophyIcon,
  UsersIcon,
  VolleyballIcon,
  VoteIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"
import type { IconNode } from "lucide-react"
import {
  baseball,
  basketball,
  bowling,
  football,
  golfDriver,
  horseHead,
  iceHockey,
  motorRacingHelmet,
  rugby,
  soccerBall,
  tennisRacket,
} from "@lucide/lab"

export type ProgrammeCategoryVisual =
  | { kind: "lucide"; icon: LucideIcon }
  | { kind: "lab"; iconNode: IconNode }

function lucide(icon: LucideIcon): ProgrammeCategoryVisual {
  return { kind: "lucide", icon }
}

function lab(iconNode: IconNode): ProgrammeCategoryVisual {
  return { kind: "lab", iconNode }
}

// Ordered rules: first match wins, so more specific keywords (e.g. "ice
// hockey", "beach volleyball") must come before their generic counterparts.
const RULES: Array<{ test: (value: string) => boolean; visual: ProgrammeCategoryVisual }> = [
  // Specific sports
  { test: (v) => v.includes("golf"), visual: lab(golfDriver) },
  { test: (v) => v.includes("soccer"), visual: lab(soccerBall) },
  { test: (v) => v.includes("football"), visual: lab(football) },
  { test: (v) => v.includes("basketball"), visual: lab(basketball) },
  { test: (v) => v.includes("baseball") || v === "mlb", visual: lab(baseball) },
  { test: (v) => v.includes("softball"), visual: lab(baseball) },
  { test: (v) => v.includes("tennis"), visual: lab(tennisRacket) },
  { test: (v) => v.includes("hockey"), visual: lab(iceHockey) },
  { test: (v) => v.includes("rugby"), visual: lab(rugby) },
  { test: (v) => v.includes("bowling"), visual: lab(bowling) },
  { test: (v) => v.includes("volleyball"), visual: lucide(VolleyballIcon) },
  { test: (v) => v.includes("horse") || v.includes("equestrian"), visual: lab(horseHead) },
  {
    test: (v) =>
      v.includes("motor") ||
      v.includes("nascar") ||
      v.includes("drag racing") ||
      v.includes("cycling") ||
      v.includes("mountain biking"),
    visual: lab(motorRacingHelmet),
  },
  {
    test: (v) => v.includes("wrestl") || v.includes("boxing") || v.includes("mma") || v.includes("martial"),
    visual: lucide(SwordsIcon),
  },
  { test: (v) => v.includes("archery") || v.includes("shooting"), visual: lucide(TargetIcon) },
  {
    test: (v) => v.includes("weightlifting") || v.includes("bodybuilding") || v.includes("gymnastics"),
    visual: lucide(DumbbellIcon),
  },
  {
    test: (v) =>
      v.includes("sailing") ||
      v.includes("boat") ||
      v.includes("watersports") ||
      v.includes("canoe") ||
      v.includes("rowing"),
    visual: lucide(SailboatIcon),
  },
  { test: (v) => v.includes("gaming") || v.includes("esports"), visual: lucide(Gamepad2Icon) },
  {
    test: (v) => v.includes("poker") || v.includes("card games") || v.includes("chess"),
    visual: lucide(Gamepad2Icon),
  },
  { test: (v) => v.includes("nfl"), visual: lab(football) },
  { test: (v) => v.includes("lacrosse"), visual: lucide(TrophyIcon) },
  { test: (v) => v.includes("fantasy"), visual: lucide(SwordsIcon) },
  {
    test: (v) =>
      v.includes("sport") ||
      v.includes("olympic") ||
      v.includes("athletic") ||
      v.includes("track/field") ||
      v.includes("skiing") ||
      v.includes("surfing") ||
      v.includes("skateboarding") ||
      v.includes("diving") ||
      v.includes("triathlon"),
    visual: lucide(TrophyIcon),
  },
  { test: (v) => v.includes("award"), visual: lucide(AwardIcon) },
  { test: (v) => v.includes("medal"), visual: lucide(MedalIcon) },

  // News / talk / factual
  { test: (v) => v.includes("news") || v.includes("newsmagazine"), visual: lucide(NewspaperIcon) },
  { test: (v) => v.includes("weather"), visual: lucide(CloudSunIcon) },
  { test: (v) => v.includes("politic") || v.includes("vote"), visual: lucide(VoteIcon) },
  { test: (v) => v.includes("public affairs"), visual: lucide(LandmarkIcon) },
  { test: (v) => v.includes("bus./financial") || v.includes("financial"), visual: lucide(BriefcaseBusinessIcon) },
  { test: (v) => v.includes("law"), visual: lucide(GavelIcon) },
  { test: (v) => v.includes("consumer") || v.includes("shopping"), visual: lucide(ShoppingCartIcon) },
  { test: (v) => v.includes("talk") || v.includes("interview"), visual: lucide(MicIcon) },
  { test: (v) => v.includes("community") || v.includes("fundraiser"), visual: lucide(UsersIcon) },
  { test: (v) => v.includes("religio"), visual: lucide(ChurchIcon) },
  {
    test: (v) => v.includes("history"),
    visual: lucide(LandmarkIcon),
  },
  { test: (v) => v.includes("science"), visual: lucide(FlaskConicalIcon) },
  { test: (v) => v.includes("medical") || v.includes("health"), visual: lucide(StethoscopeIcon) },
  { test: (v) => v.includes("educational"), visual: lucide(GraduationCapIcon) },
  { test: (v) => v.includes("documentary"), visual: lucide(GraduationCapIcon) },
  { test: (v) => v.includes("book") || v.includes("literature"), visual: lucide(BookOpenIcon) },

  // Lifestyle
  { test: (v) => v.includes("cooking") || v.includes("how-to"), visual: lucide(ChefHatIcon) },
  {
    test: (v) => v.includes("house") || v.includes("home improvement") || v.includes("garden"),
    visual: lucide(HouseIcon),
  },
  { test: (v) => v.includes("animal") || v.includes("nature"), visual: lucide(PawPrintIcon) },
  { test: (v) => v.includes("travel") || v.includes("outdoors"), visual: lucide(PlaneIcon) },
  { test: (v) => v.includes("fashion"), visual: lucide(ShirtIcon) },
  { test: (v) => v.includes("parenting"), visual: lucide(BabyIcon) },

  // Entertainment / drama
  { test: (v) => v.includes("comedy") || v.includes("sitcom"), visual: lucide(LaughIcon) },
  {
    test: (v) => v.includes("music") || v.includes("concert") || v.includes("opera") || v.includes("pop"),
    visual: lucide(MusicIcon),
  },
  { test: (v) => v.includes("theater") || v.includes("theatre") || v.includes("ballet") || v.includes("performing"), visual: lucide(TheaterIcon) },
  { test: (v) => v.includes("crime") || v.includes("mystery") || v.includes("thriller"), visual: lucide(GhostIcon) },
  { test: (v) => v.includes("action") || v.includes("adventure"), visual: lucide(SwordsIcon) },
  { test: (v) => v.includes("science fiction") || v.includes("sci-fi"), visual: lucide(RocketIcon) },
  { test: (v) => v.includes("romance") || v.includes("romantic"), visual: lucide(HeartIcon) },
  { test: (v) => v.includes("game show") || v.includes("competition") || v.includes("reality"), visual: lucide(Gamepad2Icon) },
  {
    test: (v) =>
      v.includes("drama") || v.includes("soap") || v.includes("series") || v.includes("movie") || v.includes("western"),
    visual: lucide(ClapperboardIcon),
  },
  { test: (v) => v.includes("children") || v.includes("animated") || v.includes("family"), visual: lucide(BabyIcon) },
  { test: (v) => v.includes("erotic") || v.includes("adults only"), visual: lucide(LockIcon) },
  { test: (v) => v.includes("special") || v.includes("event") || v.includes("parade") || v.includes("awards"), visual: lucide(SparklesIcon) },
  { test: (v) => v.includes("variety") || v.includes("entertainment"), visual: lucide(SparklesIcon) },
  { test: (v) => v.includes("how to") || v.includes("computers"), visual: lucide(WrenchIcon) },
]

export function resolveProgrammeCategoryIcon(
  category: string
): ProgrammeCategoryVisual | null {
  const normalized = category.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  for (const rule of RULES) {
    if (rule.test(normalized)) {
      return rule.visual
    }
  }

  return null
}
