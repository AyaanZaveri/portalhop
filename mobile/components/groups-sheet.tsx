import { forwardRef } from "react"
import { Text } from "react-native"
import {
  BottomSheetFlatList,
  type BottomSheetModal,
} from "@gorhom/bottom-sheet"
import { Check } from "lucide-react-native"

import type { BrowseFilter } from "@portalhop/shared/browse-filter"

import { useTheme } from "@/lib/theme"
import type { FavoriteGroup } from "@/lib/filters"
import { PressableScale } from "@/components/ui/pressable-scale"
import { GroupIcon } from "@/components/group-icon"
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
          <Text className="font-sans text-muted-foreground py-6 text-center text-sm">
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
                  ? "bg-accent h-11 flex-row items-center gap-2 rounded-md px-2"
                  : "h-11 flex-row items-center gap-2 rounded-md px-2"
              }
            >
              <GroupIcon icon={item.icon} size={16} color={iconPrimary} />
              <Text
                numberOfLines={1}
                className="font-rounded text-foreground flex-1 text-[15px] tracking-tight"
              >
                {item.name}
              </Text>
              {active ? (
                <Check size={16} color={colors.foreground} />
              ) : (
                <Text className="text-muted-foreground font-mono text-xs">
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
