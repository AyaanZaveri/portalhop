"use client"

import { useEffect, useState, type ComponentType } from "react"
import {
  baseball,
  basketball,
  bowling,
  cricketBall,
  football,
  golfDriver,
  horseHead,
  iceHockey,
  motorRacingHelmet,
  rugby,
  skis,
  surfboard,
  tennisRacket,
} from "@lucide/lab"
import {
  AudioLinesIcon,
  BabyIcon,
  BikeIcon,
  BookOpenIcon,
  BookmarkIcon,
  BriefcaseBusinessIcon,
  CameraIcon,
  CarIcon,
  CheckIcon,
  ChefHatIcon,
  ChurchIcon,
  CircleIcon,
  ClapperboardIcon,
  CompassIcon,
  CrownIcon,
  DiscIcon,
  DramaIcon,
  DumbbellIcon,
  FilmIcon,
  FlagIcon,
  FlameIcon,
  FolderHeartIcon,
  FolderIcon,
  FolderPlusIcon,
  Gamepad2Icon,
  GavelIcon,
  GoalIcon,
  Globe2Icon,
  GraduationCapIcon,
  GuitarIcon,
  HeadphonesIcon,
  HeartIcon,
  HouseIcon,
  Icon as LucideLabGlyph,
  IceCreamConeIcon,
  LandmarkIcon,
  LeafIcon,
  MedalIcon,
  MicIcon,
  MountainSnowIcon,
  MusicIcon,
  NewspaperIcon,
  PawPrintIcon,
  PinIcon,
  PlaneIcon,
  PodcastIcon,
  PopcornIcon,
  PlusIcon,
  PencilIcon,
  PuzzleIcon,
  RadioIcon,
  RadioTowerIcon,
  RocketIcon,
  SchoolIcon,
  ShirtIcon,
  ShoppingCartIcon,
  SmileIcon,
  SparklesIcon,
  StarIcon,
  StethoscopeIcon,
  SwordsIcon,
  TagIcon,
  TargetIcon,
  TheaterIcon,
  TicketIcon,
  TrendingUpIcon,
  TvMinimalIcon,
  Trash2Icon,
  TrophyIcon,
  VideoIcon,
  VolleyballIcon,
  WavesIcon,
  ZapIcon,
  type IconNode,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { chipButtonProps } from "@/components/tv/chip-button"
import { useTv } from "@/components/tv/tv-provider"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"

export type FavoriteGroup = {
  id: number
  name: string
  icon: string
  channelKeys: string[]
}

let cachedFavoriteGroups: FavoriteGroup[] | null = null
let favoriteGroupsRequest: Promise<FavoriteGroup[]> | null = null

function cacheFavoriteGroups(groups: FavoriteGroup[] | null) {
  cachedFavoriteGroups = groups
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("favorite-groups-updated"))
  }
}

export function getCachedFavoriteGroups() {
  return cachedFavoriteGroups
}

/**
 * Reorders one cached group's channels to match a saved sequence, then notifies
 * subscribers. Without this the list keeps rendering the order it loaded with
 * until the next full page load. Keys not in the sequence keep their existing
 * relative order at the end, since the sequence is only the visible subset.
 */
export function reorderFavoriteGroupChannelsLocal(
  groupId: number,
  channelKeys: string[],
): void {
  if (!cachedFavoriteGroups) {
    return
  }

  cacheFavoriteGroups(
    cachedFavoriteGroups.map((group) => {
      if (group.id !== groupId) {
        return group
      }

      const existing = new Set(group.channelKeys)
      const desired = channelKeys.filter((key) => existing.has(key))
      const moved = new Set(desired)

      return {
        ...group,
        channelKeys: [
          ...desired,
          ...group.channelKeys.filter((key) => !moved.has(key)),
        ],
      }
    }),
  )
}

/** Notifies when the shared favorite-group cache changes, so views filtered by
 * a group can drop or add rows without a refetch. */
export function subscribeToFavoriteGroups(listener: () => void) {
  window.addEventListener("favorite-groups-updated", listener)
  return () => window.removeEventListener("favorite-groups-updated", listener)
}

export async function loadFavoriteGroups() {
  if (cachedFavoriteGroups) return cachedFavoriteGroups
  if (!favoriteGroupsRequest) {
    favoriteGroupsRequest = apiFetch("/api/favorite-groups", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load favorite groups.")
        const body = (await response.json()) as { groups?: FavoriteGroup[] }
        cacheFavoriteGroups(Array.isArray(body.groups) ? body.groups : [])
        return cachedFavoriteGroups ?? []
      })
      .finally(() => {
        favoriteGroupsRequest = null
      })
  }
  return favoriteGroupsRequest
}

type GroupIcon = {
  id: string
  label: string
  Icon: ComponentType<{ className?: string }>
}

type GroupIconCategory = {
  id: string
  label: string
  icons: GroupIcon[]
}

/** Wraps a @lucide/lab icon node so it renders like any other lucide icon. */
function labIcon(node: IconNode) {
  return function LabIcon({ className }: { className?: string }) {
    return <LucideLabGlyph iconNode={node} className={className} />
  }
}

// Ids are persisted on saved groups, so existing ones keep both their id and
// their glyph — changing either would silently restyle someone's collection.
const groupIconCategories: GroupIconCategory[] = [
  {
    id: "sports",
    label: "Sports",
    icons: [
      { id: "goal", label: "Football", Icon: GoalIcon },
      { id: "basketball", label: "Basketball", Icon: labIcon(basketball) },
      { id: "gridiron", label: "American football", Icon: labIcon(football) },
      { id: "baseball", label: "Baseball", Icon: labIcon(baseball) },
      { id: "tennis", label: "Tennis", Icon: labIcon(tennisRacket) },
      { id: "cricket", label: "Cricket", Icon: labIcon(cricketBall) },
      { id: "rugby", label: "Rugby", Icon: labIcon(rugby) },
      { id: "icehockey", label: "Ice hockey", Icon: labIcon(iceHockey) },
      { id: "golf", label: "Golf", Icon: labIcon(golfDriver) },
      { id: "volleyball", label: "Volleyball", Icon: VolleyballIcon },
      { id: "bowling", label: "Bowling", Icon: labIcon(bowling) },
      { id: "motorsport", label: "Motorsport", Icon: labIcon(motorRacingHelmet) },
      { id: "horseracing", label: "Horse racing", Icon: labIcon(horseHead) },
      { id: "surfing", label: "Surfing", Icon: labIcon(surfboard) },
      { id: "skiing", label: "Skiing", Icon: labIcon(skis) },
      { id: "cycling", label: "Cycling", Icon: BikeIcon },
      { id: "swimming", label: "Swimming", Icon: WavesIcon },
      { id: "climbing", label: "Climbing", Icon: MountainSnowIcon },
      { id: "darts", label: "Darts", Icon: TargetIcon },
      { id: "combat", label: "Combat sports", Icon: SwordsIcon },
      { id: "dumbbell", label: "Fitness", Icon: DumbbellIcon },
      { id: "trophy", label: "Trophy", Icon: TrophyIcon },
      { id: "medal", label: "Medal", Icon: MedalIcon },
      { id: "racing", label: "Racing", Icon: FlagIcon },
    ],
  },
  {
    id: "entertainment",
    label: "Entertainment",
    icons: [
      { id: "film", label: "Movies", Icon: FilmIcon },
      { id: "clapperboard", label: "Shows", Icon: ClapperboardIcon },
      { id: "popcorn", label: "Entertainment", Icon: PopcornIcon },
      { id: "tv", label: "TV", Icon: TvMinimalIcon },
      { id: "theatre", label: "Theatre", Icon: TheaterIcon },
      { id: "drama", label: "Drama", Icon: DramaIcon },
      { id: "events", label: "Events", Icon: TicketIcon },
      { id: "video", label: "Video", Icon: VideoIcon },
      { id: "gamepad", label: "Gaming", Icon: Gamepad2Icon },
    ],
  },
  {
    id: "music",
    label: "Music and audio",
    icons: [
      { id: "music", label: "Music", Icon: MusicIcon },
      { id: "radio", label: "Radio", Icon: RadioIcon },
      { id: "podcast", label: "Podcasts", Icon: PodcastIcon },
      { id: "headphones", label: "Headphones", Icon: HeadphonesIcon },
      { id: "albums", label: "Albums", Icon: DiscIcon },
      { id: "livemusic", label: "Live music", Icon: GuitarIcon },
      { id: "talk", label: "Talk", Icon: MicIcon },
      { id: "audio", label: "Audio", Icon: AudioLinesIcon },
    ],
  },
  {
    id: "news",
    label: "News and knowledge",
    icons: [
      { id: "news", label: "News", Icon: NewspaperIcon },
      { id: "globe", label: "World", Icon: Globe2Icon },
      { id: "book", label: "Learning", Icon: BookOpenIcon },
      { id: "education", label: "Education", Icon: GraduationCapIcon },
      { id: "politics", label: "Politics", Icon: LandmarkIcon },
      { id: "law", label: "Law", Icon: GavelIcon },
      { id: "business", label: "Business", Icon: BriefcaseBusinessIcon },
      { id: "markets", label: "Markets", Icon: TrendingUpIcon },
      { id: "live", label: "Live", Icon: RadioTowerIcon },
    ],
  },
  {
    id: "family",
    label: "Kids and family",
    icons: [
      { id: "school", label: "Kids", Icon: SchoolIcon },
      { id: "baby", label: "Baby", Icon: BabyIcon },
      { id: "puzzle", label: "Puzzles", Icon: PuzzleIcon },
      { id: "treats", label: "Treats", Icon: IceCreamConeIcon },
      { id: "animals", label: "Animals", Icon: PawPrintIcon },
      { id: "space", label: "Space", Icon: RocketIcon },
      { id: "fun", label: "Fun", Icon: SmileIcon },
    ],
  },
  {
    id: "lifestyle",
    label: "Lifestyle",
    icons: [
      { id: "house", label: "Home", Icon: HouseIcon },
      { id: "food", label: "Food", Icon: ChefHatIcon },
      { id: "travel", label: "Travel", Icon: PlaneIcon },
      { id: "shopping", label: "Shopping", Icon: ShoppingCartIcon },
      { id: "fashion", label: "Fashion", Icon: ShirtIcon },
      { id: "health", label: "Health", Icon: StethoscopeIcon },
      { id: "faith", label: "Faith", Icon: ChurchIcon },
      { id: "nature", label: "Nature", Icon: LeafIcon },
      { id: "cars", label: "Cars", Icon: CarIcon },
      { id: "photography", label: "Photography", Icon: CameraIcon },
    ],
  },
  {
    id: "general",
    label: "General",
    icons: [
      { id: "star", label: "Star", Icon: StarIcon },
      { id: "heart", label: "Heart", Icon: HeartIcon },
      { id: "sparkles", label: "Highlights", Icon: SparklesIcon },
      { id: "bookmark", label: "Saved", Icon: BookmarkIcon },
      { id: "trending", label: "Trending", Icon: FlameIcon },
      { id: "quick", label: "Quick picks", Icon: ZapIcon },
      { id: "premium", label: "Premium", Icon: CrownIcon },
      { id: "collection", label: "Collection", Icon: FolderIcon },
      { id: "tag", label: "Tag", Icon: TagIcon },
      { id: "pinned", label: "Pinned", Icon: PinIcon },
      { id: "discover", label: "Discover", Icon: CompassIcon },
      { id: "plain", label: "Plain", Icon: CircleIcon },
    ],
  },
]

const groupIcons: GroupIcon[] = groupIconCategories.flatMap(
  (category) => category.icons,
)

export function getFavoriteGroupIcon(iconId: string) {
  return groupIcons.find((icon) => icon.id === iconId)?.Icon ?? StarIcon
}

/**
 * Picks an icon from the group's name as it is typed. Ordered specific to
 * generic, first match wins: "American football" has to beat "football", and
 * "live music" has to beat both "music" and "live". Keywords follow the same
 * vocabulary as the programme-guide category icons so a group named after a
 * genre lands on the same glyph the schedule uses for it.
 */
function suggestGroupIcon(name: string) {
  const normalizedName = name.trim().toLowerCase()
  const matches: Array<[string, string[]]> = [
    // Sports — specific codes first, then the generic fallbacks.
    ["horseracing", ["horse racing", "horse", "racing post", "derby"]],
    ["motorsport", ["f1", "formula", "nascar", "motogp", "motorsport", "grand prix", "rally"]],
    ["gridiron", ["nfl", "american football", "gridiron", "super bowl"]],
    ["basketball", ["basketball", "nba", "hoops", "wnba"]],
    ["baseball", ["baseball", "mlb", "world series"]],
    ["tennis", ["tennis", "wimbledon", "atp", "wta", "us open"]],
    ["cricket", ["cricket", "ipl", "the ashes", "t20"]],
    ["rugby", ["rugby", "nrl", "six nations"]],
    ["icehockey", ["ice hockey", "hockey", "nhl"]],
    ["golf", ["golf", "pga", "the masters", "ryder cup"]],
    ["volleyball", ["volleyball"]],
    ["bowling", ["bowling", "bowls", "snooker", "pool"]],
    ["surfing", ["surf"]],
    ["skiing", ["ski", "snowboard", "slalom", "winter sports"]],
    ["cycling", ["cycling", "cycle", "bike", "tour de france"]],
    ["swimming", ["swim", "diving", "water polo"]],
    ["climbing", ["climb", "mountain", "hiking", "alpine"]],
    ["darts", ["darts", "archery", "shooting"]],
    ["combat", ["boxing", "mma", "ufc", "wrestling", "martial", "judo", "karate", "fight"]],
    ["goal", ["football", "soccer", "futbol", "premier league", "la liga", "uefa", "fifa", "mls"]],
    ["dumbbell", ["gym", "fitness", "workout", "training", "exercise"]],
    ["medal", ["olympic", "medal", "championship"]],
    ["racing", ["racing", "race"]],
    ["trophy", ["sport", "league", "cup", "tournament", "match"]],

    // Music and audio.
    ["livemusic", ["live music", "concert", "gig", "festival"]],
    ["podcast", ["podcast"]],
    ["radio", ["radio", "fm"]],
    ["albums", ["album", "vinyl", "record"]],
    ["headphones", ["headphone", "audiobook"]],
    ["talk", ["talk", "interview", "chat show"]],
    ["music", ["music", "song", "hits", "charts"]],
    ["audio", ["audio", "sound"]],

    // Screen.
    ["film", ["movie", "film", "cinema", "blockbuster"]],
    ["theatre", ["theatre", "theater", "opera", "ballet", "performing"]],
    ["drama", ["drama", "soap"]],
    ["clapperboard", ["show", "series", "episode", "box set"]],
    ["events", ["event", "ticket"]],
    ["video", ["video", "clips"]],
    ["gamepad", ["game", "gaming", "esports", "twitch"]],
    ["popcorn", ["entertainment"]],

    // News and knowledge.
    ["news", ["news", "headlines", "breaking", "current affairs"]],
    ["politics", ["politic", "parliament", "election", "senate", "congress"]],
    ["law", ["law", "court", "crime", "justice", "legal"]],
    ["markets", ["market", "stocks", "trading", "crypto"]],
    ["business", ["business", "finance", "economy", "corporate"]],
    ["live", ["live", "broadcast", "on air"]],
    ["globe", ["world", "international", "global", "abroad"]],
    ["education", ["education", "university", "college", "study", "lecture"]],
    ["book", ["learn", "documentar", "history", "science", "book"]],

    // Kids and family.
    ["school", ["school", "kids", "children", "cartoon", "nursery"]],
    ["baby", ["baby", "infant", "preschool", "toddler"]],
    ["puzzle", ["puzzle", "quiz", "trivia"]],
    ["treats", ["dessert", "ice cream", "candy", "sweets"]],
    ["animals", ["animal", "wildlife", "pets", "nature doc"]],
    ["space", ["space", "astronomy", "nasa", "galaxy", "sci-fi", "scifi"]],
    ["fun", ["comedy", "funny", "laugh", "humour", "humor"]],

    // Lifestyle.
    ["food", ["food", "cooking", "cook", "chef", "recipe", "bake", "kitchen"]],
    ["travel", ["travel", "holiday", "vacation", "flight", "tourism"]],
    ["shopping", ["shopping", "shop", "retail", "deals", "store"]],
    ["fashion", ["fashion", "style", "clothing", "runway", "beauty"]],
    ["health", ["health", "medical", "doctor", "wellness", "hospital"]],
    ["faith", ["faith", "religion", "church", "gospel", "islam", "christian"]],
    ["cars", ["car", "auto", "motor", "vehicle", "driving"]],
    ["photography", ["photo", "camera"]],
    ["nature", ["nature", "outdoor", "environment", "garden"]],
    ["house", ["home", "local", "house", "diy", "property"]],

    // General.
    ["heart", ["favourite", "favorite", "love", "romance"]],
    ["sparkles", ["highlight", "best of", "featured", "special"]],
    ["bookmark", ["saved", "bookmark", "watch later"]],
    ["trending", ["trending", "popular", "top picks"]],
    ["premium", ["premium", "vip", "exclusive"]],
    ["collection", ["collection", "folder", "misc"]],
    ["pinned", ["pinned"]],
    ["discover", ["discover", "explore", "browse"]],
    ["tv", ["tv", "television", "channel"]],
  ]

  return (
    matches.find(([, terms]) =>
      terms.some((term) => normalizedName.includes(term)),
    )?.[0] ?? "star"
  )
}

export function FavoriteGroupsDrawer({
  activeGroupId,
  isSessionLoading,
  isMobileLayout,
  onDeleteGroup,
  onSelectGroup,
  userId,
}: {
  activeGroupId: number | null
  /** Keep the trigger mounted while a signed-in session hydrates. */
  isSessionLoading: boolean
  isMobileLayout: boolean
  onDeleteGroup: (groupId: number) => void
  onSelectGroup: (group: FavoriteGroup) => void
  userId: string | null
}) {
  const { countResolvedChannels } = useTv()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<FavoriteGroup | null>(null)
  const [groups, setGroups] = useState<FavoriteGroup[]>([])
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState("")
  const [icon, setIcon] = useState("star")
  const [iconSelectedManually, setIconSelectedManually] = useState(false)
  const [isManagingGroups, setIsManagingGroups] = useState(false)
  const [groupPendingDelete, setGroupPendingDelete] =
    useState<FavoriteGroup | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeletingGroup, setIsDeletingGroup] = useState(false)

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    loadFavoriteGroups()
      .then((loadedGroups) => {
        if (!cancelled) setGroups(loadedGroups)
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load favorite groups.")
      })
      .finally(() => {
        if (!cancelled) setLoadedUserId(userId)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    const syncCachedGroups = () => {
      if (cachedFavoriteGroups) setGroups(cachedFavoriteGroups)
    }
    window.addEventListener("favorite-groups-updated", syncCachedGroups)
    return () => window.removeEventListener("favorite-groups-updated", syncCachedGroups)
  }, [])

  const isLoading = loadedUserId !== userId

  const closeCreateDrawer = (nextOpen: boolean) => {
    setCreateOpen(nextOpen)
    if (!nextOpen && !isCreating) {
      setName("")
      setIcon("star")
      setIconSelectedManually(false)
      setEditingGroup(null)
    }
  }

  const createGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    setIsCreating(true)
    try {
      const response = await fetch(
        editingGroup
          ? `/api/favorite-groups?groupId=${editingGroup.id}`
          : "/api/favorite-groups",
        {
        method: editingGroup ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, icon }),
        },
      )
      const body = (await response.json().catch(() => null)) as {
        group?: FavoriteGroup
        error?: string
      } | null

      if (!response.ok || !body?.group) {
        throw new Error(body?.error ?? "Could not create favorite group.")
      }

      const nextGroup = editingGroup
        ? { ...body.group, channelKeys: editingGroup.channelKeys }
        : (body.group as FavoriteGroup)
      const nextGroups = editingGroup
        ? groups.map((group) => (group.id === editingGroup.id ? nextGroup : group))
        : [...groups, nextGroup]
      setGroups(nextGroups)
      cacheFavoriteGroups(nextGroups)
      setCreateOpen(false)
      setName("")
      setIcon("star")
      setIconSelectedManually(false)
      setEditingGroup(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create favorite group.",
      )
    } finally {
      setIsCreating(false)
    }
  }

  const deleteGroup = async () => {
    if (!groupPendingDelete) return

    setIsDeletingGroup(true)
    try {
      const response = await apiFetch(
        `/api/favorite-groups?groupId=${groupPendingDelete.id}`,
        { method: "DELETE" },
      )
      if (!response.ok) throw new Error("Could not delete favorite group.")

      const deletedGroupId = groupPendingDelete.id
      setGroups((current) => current.filter((group) => group.id !== deletedGroupId))
      cacheFavoriteGroups(
        (cachedFavoriteGroups ?? []).filter((group) => group.id !== deletedGroupId),
      )
      onDeleteGroup(deletedGroupId)
      setDeleteDialogOpen(false)
      setGroupPendingDelete(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete favorite group.",
      )
    } finally {
      setIsDeletingGroup(false)
    }
  }

  const closeDeleteDialog = () => {
    if (isDeletingGroup) return
    setDeleteDialogOpen(false)
    window.setTimeout(() => setGroupPendingDelete(null), 100)
  }

  // `userId` is temporarily null while the session hydrates. Leaving the chip
  // mounted avoids the row shifting from three controls to four on refresh;
  // once hydration confirms a signed-out visitor, it disappears as before.
  if (!userId && !isSessionLoading) return null

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setCreateOpen(false)
      }}
      swipeDirection={isMobileLayout ? "down" : "left"}
      showSwipeHandle={isMobileLayout}
    >
      <DrawerTrigger
        render={
          <Button
            type="button"
            {...chipButtonProps(activeGroupId !== null, { iconOnly: true })}
            aria-label="Favorite groups"
            disabled={!userId}
          >
            <FolderHeartIcon className="size-3.5" />
            <span className="sr-only">Groups</span>
          </Button>
        }
      />
      <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl dark:border backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:75dvh]">
        <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DrawerTitle className="text-lg">Groups</DrawerTitle>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {groups.length ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={
                    isManagingGroups
                      ? "Finish managing favorite groups"
                      : "Manage favorite groups"
                  }
                  onClick={() => setIsManagingGroups((current) => !current)}
                >
                  {isManagingGroups ? (
                    <CheckIcon className="size-4 stroke-[2.25]" />
                  ) : (
                    <PencilIcon className="size-4 stroke-[2.25]" />
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
          {isLoading ? (
            <div className="flex flex-col gap-1" aria-label="Loading favorite groups">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 px-2 py-2">
                  <Skeleton className="size-8 shrink-0 rounded-md" />
                  <Skeleton className="h-4 w-2/5" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {groups.length ? groups.map((group) => {
                        const Icon = getFavoriteGroupIcon(group.icon)
                return (
                  <div
                    key={group.id}
                    className="flex w-full items-center gap-1"
                  >
                    {/* The row surface lives on the button rather than the
                        wrapper so it presses like the New group row. The edit
                        and delete controls stay siblings — a button cannot be
                        nested inside another. */}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (isManagingGroups) return
                        onSelectGroup(group)
                        setOpen(false)
                      }}
                      className={cn(
                        "hover:bg-accent hover:text-accent-foreground h-9 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-sm font-normal",
                        activeGroupId === group.id && "bg-accent",
                      )}
                    >
                      <Icon className="text-primary size-4 shrink-0 brightness-85 dark:brightness-100" />
                      <span className="min-w-0 flex-1 truncate text-left font-mono font-medium tracking-tight">
                        {group.name}
                      </span>
                      {isManagingGroups ? null : (
                        <span className="text-muted-foreground shrink-0 pl-2 font-mono text-xs tabular-nums">
                          {/* Channels, not stored keys. A key that names
                              nothing -- a guide id reassigned out from under
                              it -- and two keys naming one channel both count
                              once here, which is what the list below does when
                              it resolves them. The two numbers disagreeing is
                              how this was found: a group of three reading six. */}
                          {countResolvedChannels(group.channelKeys).toLocaleString()}
                        </span>
                      )}
                    </Button>
                    {isManagingGroups ? (
                      <>
                        <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label={`Edit ${group.name}`}
                        onClick={() => {
                          setEditingGroup(group)
                          setName(group.name)
                          setIcon(group.icon)
                          setIconSelectedManually(true)
                          setCreateOpen(true)
                        }}
                      >
                        <PencilIcon className="size-4" />
                        </Button>
                        <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="-mr-1 shrink-0"
                        aria-label={`Delete ${group.name}`}
                        onClick={() => {
                          setGroupPendingDelete(group)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2Icon className="size-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                )
              }) : (
                <Empty className="min-h-44 border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FolderHeartIcon />
                    </EmptyMedia>
                    <EmptyTitle>No groups yet</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
              {/* Sits after the groups rather than in the header so it reads as
                  the next row in the list, and so an empty list still offers the
                  one action worth taking. */}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(true)}
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground h-9 w-full justify-start gap-2 rounded-md px-2 text-sm font-normal"
              >
                <PlusIcon className="size-4 shrink-0 stroke-[2.25]" />
                <span className="min-w-0 flex-1 truncate text-left font-mono font-medium tracking-tight">
                  New group
                </span>
              </Button>
            </div>
          )}
        </div>

        <Drawer
          open={createOpen}
          onOpenChange={closeCreateDrawer}
          swipeDirection={isMobileLayout ? "down" : "left"}
        >
          <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl dark:border backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:85dvh]">
            <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
              <DrawerTitle className="text-lg">
                {editingGroup ? "Edit group" : "New group"}
              </DrawerTitle>
              <DrawerDescription>
                {editingGroup
                  ? "Update this collection’s name or icon."
                  : "Give this collection a name and icon."}
              </DrawerDescription>
            </DrawerHeader>
            <form
              className="flex min-h-0 flex-1 flex-col gap-5 p-4 pt-4"
              onSubmit={createGroup}
            >
              <FieldGroup className="min-h-0 flex-1">
                <Field>
                  <FieldLabel htmlFor="favorite-group-name">Name</FieldLabel>
                  <Input
                    id="favorite-group-name"
                    value={name}
                    onChange={(event) => {
                      const nextName = event.target.value
                      setName(nextName)
                      if (!iconSelectedManually) {
                        setIcon(suggestGroupIcon(nextName))
                      }
                    }}
                    placeholder="e.g. Weekend sports"
                    maxLength={60}
                    required
                  />
                </Field>
                <Field className="min-h-0 flex-1">
                  <FieldLabel>Icon</FieldLabel>
                  {/* Grows into whatever the sheet has left. min-h keeps it
                      usable on mobile, where the drawer is content-sized and
                      there is no free height to claim. */}
                  <ScrollArea className="min-h-64 flex-1">
                    {/* The app-wide provider opens instantly, which turns a
                        grid this dense into a flicker of labels as the pointer
                        crosses it. A short delay means only a deliberate hover
                        names an icon. */}
                    <TooltipProvider delay={500}>
                      <div
                        role="radiogroup"
                        aria-label="Group icon"
                        className="flex flex-col gap-4 pr-3"
                      >
                      {groupIconCategories.map((category) => (
                        <div key={category.id} className="flex flex-col gap-2">
                          <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                            {category.label}
                          </p>
                          <div className="grid grid-cols-6 gap-2">
                            {category.icons.map((groupIconOption) => {
                              const Icon = groupIconOption.Icon
                              const selected = icon === groupIconOption.id
                              return (
                                <Tooltip key={groupIconOption.id}>
                                  <TooltipTrigger
                                    render={
                                      <Button
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        aria-label={groupIconOption.label}
                                        variant="secondary"
                                        size="icon-lg"
                                        onClick={() => {
                                          setIcon(groupIconOption.id)
                                          setIconSelectedManually(true)
                                        }}
                                        className={cn(
                                          "bg-secondary text-muted-foreground hover:bg-secondary/80 h-10 w-full rounded-lg",
                                          selected &&
                                            "bg-primary/15 text-primary hover:bg-primary/20 brightness-85 dark:brightness-100",
                                        )}
                                      >
                                        <Icon className="size-4.5" />
                                      </Button>
                                    }
                                  />
                                  <TooltipContent>
                                    {groupIconOption.label}
                                  </TooltipContent>
                                </Tooltip>
                              )
                            })}
                          </div>
                        </div>
                        ))}
                      </div>
                    </TooltipProvider>
                  </ScrollArea>
                </Field>
              </FieldGroup>
              {/* mt-auto pins this to the foot of the side sheet, which is full
                  height. On mobile the drawer is sized to its content, so there
                  is no free space and it simply follows the fields. */}
              <Button
                type="submit"
                className="mt-auto"
                disabled={!name.trim() || isCreating}
              >
                {editingGroup ? "Save changes" : "Create group"}
              </Button>
            </form>
          </DrawerContent>
        </Drawer>
      </DrawerContent>
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDeleteDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              {groupPendingDelete
                ? `“${groupPendingDelete.name}” and its channel list will be permanently removed.`
                : "This group will be permanently removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeletingGroup}
              onClick={closeDeleteDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletingGroup}
              onClick={deleteGroup}
            >
              Delete group
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Drawer>
  )
}

export function GroupMembershipDrawer({
  channel,
  isMobileLayout,
  onOpenChange,
}: {
  channel: { key: string; name: string } | null
  isMobileLayout: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [groups, setGroups] = useState<FavoriteGroup[] | null>(cachedFavoriteGroups)

  useEffect(() => {
    if (!channel) return

    let cancelled = false
    loadFavoriteGroups()
      .then((loadedGroups) => {
        if (!cancelled) setGroups(loadedGroups)
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load favorite groups.")
      })

    return () => {
      cancelled = true
    }
  }, [channel])

  const toggleGroup = async (group: FavoriteGroup) => {
    if (!channel) return
    const included = group.channelKeys.includes(channel.key)
    const nextGroups = (groups ?? []).map((entry) =>
      entry.id !== group.id
        ? entry
        : {
            ...entry,
            channelKeys: included
              ? entry.channelKeys.filter((key) => key !== channel.key)
              : [...entry.channelKeys, channel.key],
          },
    )
    setGroups(nextGroups)
    cacheFavoriteGroups(nextGroups)

    try {
      const response = await apiFetch(`/api/favorite-groups/${group.id}/channels`, {
        method: included ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelKey: channel.key }),
      })
      if (!response.ok) throw new Error("Could not update favorite group.")
    } catch (error) {
      setGroups(groups)
      cacheFavoriteGroups(groups)
      toast.error(
        error instanceof Error ? error.message : "Could not update favorite group.",
      )
    }
  }

  return (
    <Drawer
      open={channel !== null}
      onOpenChange={onOpenChange}
      swipeDirection={isMobileLayout ? "down" : "left"}
    >
      <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl dark:border backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:75dvh]">
        <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="text-lg">Groups</DrawerTitle>
          <DrawerDescription className="truncate">
            {channel?.name ?? "Channel"}
          </DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
          {groups === null ? (
            <div className="flex flex-col gap-1" aria-label="Loading favorite groups">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 px-2 py-2">
                  <Skeleton className="size-4 shrink-0" />
                  <Skeleton className="h-4 w-2/5" />
                </div>
              ))}
            </div>
          ) : groups.length ? (
            <div className="flex flex-col gap-1">
              {groups.map((group) => {
                const Icon = getFavoriteGroupIcon(group.icon)
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleGroup(group)}
                    aria-pressed={group.channelKeys.includes(channel?.key ?? "")}
                    className={cn(
                      "hover:bg-accent hover:text-accent-foreground flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                      group.channelKeys.includes(channel?.key ?? "") && "bg-accent/70 text-accent-foreground",
                    )}
                  >
                    <Icon className="text-primary size-4 shrink-0 brightness-85 dark:brightness-100" />
                    <span className="min-w-0 flex-1 truncate font-mono font-medium tracking-tight">
                      {group.name}
                    </span>
                    {group.channelKeys.includes(channel?.key ?? "") ? (
                      <CheckIcon className="size-4 shrink-0" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : (
            <Empty className="min-h-44 border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderPlusIcon />
                </EmptyMedia>
                <EmptyTitle>Create a favorite group first</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
        {groups?.length ? (
          <div className="p-4 pt-0">
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
