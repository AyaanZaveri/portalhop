import { forwardRef } from "react"
import { Text } from "react-native"
import { BottomSheetFlatList, type BottomSheetModal } from "@gorhom/bottom-sheet"
import { Check, FolderHeart } from "lucide-react-native"

import type { BrowseFilter } from "@portalhop/shared/browse-filter"

import { useTheme } from "@/lib/theme"
import type { FavoriteGroup } from "@/lib/filters"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Sheet } from "@/components/ui/sheet"

export const GroupsSheet = forwardRef<
  BottomSheetModal,
  {
    groups: FavoriteGroup[]
    filter: BrowseFilter
    onSelect: (group: FavoriteGroup) => void
  }
>(function GroupsSheet({ groups, filter, onSelect }, ref) {
  const { colors, iconPrimary } = useTheme()

  return (
    <Sheet ref={ref} title="Groups" snapPoints={["75%"]}>
      <BottomSheetFlatList
        data={groups}
        keyExtractor={(group) => String(group.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <Text className="py-6 text-center text-sm text-muted-foreground">
            No groups yet. Create one on the web app.
          </Text>
        }
        renderItem={({ item }) => {
          const active =
            filter.type === "favoriteGroup" && filter.groupId === item.id

          return (
            <PressableScale
              preset="row"
              onPress={() => onSelect(item)}
              className={
                active
                  ? "h-11 flex-row items-center gap-2 rounded-md bg-accent px-2"
                  : "h-11 flex-row items-center gap-2 rounded-md px-2"
              }
            >
              {/* Every group carries its own icon name from a fixed allowlist.
                  Rendering the right one needs that name-to-component map,
                  which is still web-only — one placeholder until it moves. */}
              <FolderHeart size={16} color={iconPrimary} />
              <Text
                numberOfLines={1}
                className="flex-1 font-mono-medium text-[15px] tracking-tight text-foreground"
              >
                {item.name}
              </Text>
              {active ? (
                <Check size={16} color={colors.foreground} />
              ) : (
                <Text className="font-mono text-xs text-muted-foreground">
                  {item.channelKeys.length.toLocaleString()}
                </Text>
              )}
            </PressableScale>
          )
        }}
      />
    </Sheet>
  )
})
