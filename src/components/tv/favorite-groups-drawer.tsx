"use client"

import { useEffect, useState, type ComponentType } from "react"
import { cricketBall } from "@lucide/lab"
import {
  BookOpenIcon,
  CheckIcon,
  ClapperboardIcon,
  DumbbellIcon,
  FilmIcon,
  FolderHeartIcon,
  FolderPlusIcon,
  Gamepad2Icon,
  GoalIcon,
  Globe2Icon,
  HeartIcon,
  HouseIcon,
  Icon as IconNode,
  MusicIcon,
  NewspaperIcon,
  PodcastIcon,
  PopcornIcon,
  PlusIcon,
  PencilIcon,
  RadioIcon,
  SchoolIcon,
  SparklesIcon,
  StarIcon,
  TvMinimalIcon,
  Trash2Icon,
  TrophyIcon,
  VolleyballIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"

type FavoriteGroup = {
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

async function loadFavoriteGroups() {
  if (cachedFavoriteGroups) return cachedFavoriteGroups
  if (!favoriteGroupsRequest) {
    favoriteGroupsRequest = fetch("/api/favorite-groups", { cache: "no-store" })
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

function CricketIcon({ className }: { className?: string }) {
  return <IconNode iconNode={cricketBall} className={className} />
}

const groupIcons: GroupIcon[] = [
  { id: "star", label: "Star", Icon: StarIcon },
  { id: "trophy", label: "Sports", Icon: TrophyIcon },
  { id: "cricket", label: "Cricket", Icon: CricketIcon },
  { id: "goal", label: "Football", Icon: GoalIcon },
  { id: "volleyball", label: "Volleyball", Icon: VolleyballIcon },
  { id: "dumbbell", label: "Fitness", Icon: DumbbellIcon },
  { id: "film", label: "Movies", Icon: FilmIcon },
  { id: "clapperboard", label: "Shows", Icon: ClapperboardIcon },
  { id: "popcorn", label: "Entertainment", Icon: PopcornIcon },
  { id: "music", label: "Music", Icon: MusicIcon },
  { id: "radio", label: "Radio", Icon: RadioIcon },
  { id: "podcast", label: "Podcasts", Icon: PodcastIcon },
  { id: "gamepad", label: "Gaming", Icon: Gamepad2Icon },
  { id: "heart", label: "Heart", Icon: HeartIcon },
  { id: "house", label: "Home", Icon: HouseIcon },
  { id: "globe", label: "World", Icon: Globe2Icon },
  { id: "news", label: "News", Icon: NewspaperIcon },
  { id: "book", label: "Learning", Icon: BookOpenIcon },
  { id: "school", label: "Kids", Icon: SchoolIcon },
  { id: "tv", label: "TV", Icon: TvMinimalIcon },
  { id: "sparkles", label: "Highlights", Icon: SparklesIcon },
]

function groupIcon(iconId: string) {
  return groupIcons.find((icon) => icon.id === iconId)?.Icon ?? StarIcon
}

function suggestGroupIcon(name: string) {
  const normalizedName = name.trim().toLowerCase()
  const matches: Array<[string, string[]]> = [
    ["cricket", ["cricket"]],
    ["goal", ["football", "soccer"]],
    ["volleyball", ["volleyball"]],
    ["dumbbell", ["gym", "fitness", "workout"]],
    ["gamepad", ["game", "gaming", "esports"]],
    ["trophy", ["sport", "nba", "nfl", "mlb", "f1", "formula"]],
    ["film", ["movie", "film", "cinema"]],
    ["clapperboard", ["show", "series", "drama"]],
    ["popcorn", ["entertainment"]],
    ["music", ["music", "concert"]],
    ["radio", ["radio"]],
    ["podcast", ["podcast"]],
    ["news", ["news"]],
    ["book", ["learn", "education", "documentary"]],
    ["school", ["kids", "children", "family"]],
    ["globe", ["world", "international", "global"]],
    ["house", ["home", "local"]],
    ["tv", ["tv", "television"]],
  ]

  return matches.find(([, terms]) => terms.some((term) => normalizedName.includes(term)))?.[0] ?? "star"
}

export function FavoriteGroupsDrawer({
  activeGroupId,
  isMobileLayout,
  onDeleteGroup,
  onSelectGroup,
  userId,
}: {
  activeGroupId: number | null
  isMobileLayout: boolean
  onDeleteGroup: (groupId: number) => void
  onSelectGroup: (group: FavoriteGroup) => void
  userId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
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
    }
  }

  const createGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    setIsCreating(true)
    try {
      const response = await fetch("/api/favorite-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, icon }),
      })
      const body = (await response.json().catch(() => null)) as {
        group?: FavoriteGroup
        error?: string
      } | null

      if (!response.ok || !body?.group) {
        throw new Error(body?.error ?? "Could not create favorite group.")
      }

      setGroups((current) => [...current, body.group as FavoriteGroup])
      cacheFavoriteGroups([...(cachedFavoriteGroups ?? []), body.group])
      setCreateOpen(false)
      setName("")
      setIcon("star")
      setIconSelectedManually(false)
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
      const response = await fetch(
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

  if (!userId) return null

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setCreateOpen(false)
      }}
      swipeDirection={isMobileLayout ? "down" : "left"}
    >
      <DrawerTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="text-muted-foreground rounded-full"
            aria-label="Favorite groups"
          >
            <FolderHeartIcon className="size-3.5" />
          </Button>
        }
      />
      <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl border backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:75dvh]">
        <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DrawerTitle className="text-lg">Favorite Groups</DrawerTitle>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Create favorite group"
                onClick={() => setCreateOpen(true)}
              >
                <PlusIcon />
              </Button>
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
                  {isManagingGroups ? <CheckIcon /> : <PencilIcon />}
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
          ) : groups.length ? (
            <div className="flex flex-col gap-1">
              {groups.map((group) => {
                const Icon = groupIcon(group.icon)
                return (
                  <div
                    key={group.id}
                    className={cn(
                      "hover:bg-accent hover:text-accent-foreground flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                      activeGroupId === group.id && "bg-accent",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isManagingGroups) return
                        onSelectGroup(group)
                        setOpen(false)
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Icon className="text-primary size-4 shrink-0 brightness-85 dark:brightness-100" />
                      <span className="min-w-0 flex-1 truncate font-mono font-medium tracking-tight">
                        {group.name}
                      </span>
                    </button>
                    {isManagingGroups ? (
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
                    ) : (
                      <span className="text-muted-foreground ml-auto shrink-0 pl-2 font-mono text-xs tabular-nums">
                        {group.channelKeys.length.toLocaleString()}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty className="min-h-44 border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderHeartIcon />
                </EmptyMedia>
                <EmptyTitle>No groups yet</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        <Drawer
          open={createOpen}
          onOpenChange={closeCreateDrawer}
          swipeDirection={isMobileLayout ? "down" : "left"}
        >
          <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl border backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:auto]">
            <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
              <DrawerTitle className="text-lg">New favorite group</DrawerTitle>
              <DrawerDescription>
                Give this collection a name and icon.
              </DrawerDescription>
            </DrawerHeader>
            <form className="flex flex-col gap-5 p-4 pt-4" onSubmit={createGroup}>
              <FieldGroup>
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
                    autoFocus
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Icon</FieldLabel>
                  <div
                    role="radiogroup"
                    aria-label="Group icon"
                    className="grid grid-cols-6 gap-2"
                  >
                    {groupIcons.map((groupIconOption) => {
                      const Icon = groupIconOption.Icon
                      const selected = icon === groupIconOption.id
                      return (
                        <Button
                          key={groupIconOption.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={groupIconOption.label}
                          title={groupIconOption.label}
                          variant="secondary"
                          size="icon-lg"
                          onClick={() => {
                            setIcon(groupIconOption.id)
                            setIconSelectedManually(true)
                          }}
                          className={cn(
                            "h-10 w-full rounded-lg bg-secondary text-muted-foreground hover:bg-secondary/80",
                            selected &&
                            "bg-primary/15 text-primary hover:bg-primary/20 brightness-85 dark:brightness-100",
                          )}
                        >
                          <Icon className="size-4.5" />
                        </Button>
                      )
                    })}
                  </div>
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={!name.trim() || isCreating}>
                Create group
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
            <AlertDialogTitle>Delete favorite group?</AlertDialogTitle>
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
  onChannelFavorited,
  onOpenChange,
}: {
  channel: { key: string; name: string } | null
  isMobileLayout: boolean
  onChannelFavorited: (channelKey: string) => void
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

  const addToGroup = async (group: FavoriteGroup) => {
    if (!channel) return
    const nextGroups = (groups ?? []).map((entry) =>
      entry.id !== group.id
        ? entry
        : {
            ...entry,
            channelKeys: entry.channelKeys.includes(channel.key)
              ? entry.channelKeys
              : [...entry.channelKeys, channel.key],
          },
    )
    setGroups(nextGroups)
    cacheFavoriteGroups(nextGroups)
    onOpenChange(false)

    try {
      const response = await fetch(`/api/favorite-groups/${group.id}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelKey: channel.key }),
      })
      if (!response.ok) throw new Error("Could not update favorite group.")
      onChannelFavorited(channel.key)
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
      <DrawerContent className="bg-background/95 dark:bg-background/85 rounded-xl border backdrop-blur-md [--drawer-inset:0.5rem] after:hidden data-[swipe-axis=y]:[--drawer-height:75dvh]">
        <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="text-lg">Favorite groups</DrawerTitle>
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
                const Icon = groupIcon(group.icon)
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => addToGroup(group)}
                    className={cn(
                      "hover:bg-accent hover:text-accent-foreground flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                    )}
                  >
                    <Icon className="text-primary size-4 shrink-0 brightness-85 dark:brightness-100" />
                    <span className="min-w-0 flex-1 truncate font-mono font-medium tracking-tight">
                      {group.name}
                    </span>
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
      </DrawerContent>
    </Drawer>
  )
}
