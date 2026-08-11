import { forwardRef } from "react"
import { Text, View } from "react-native"
import {
  BottomSheetFlatList,
  type BottomSheetModal,
} from "@gorhom/bottom-sheet"
import { Check } from "lucide-react-native"

import {
  favoriteKeyFor,
  isFavorited,
  type ChannelWithStreams,
} from "@/lib/channels"
import type { FavoriteGroup } from "@/lib/filters"
import { useToggleGroupMembership } from "@/lib/mutations"
import { select } from "@/lib/haptics"
import { useTheme } from "@/lib/theme"
import { PressableScale } from "@/components/ui/pressable-scale"
import { GroupIcon } from "@/components/group-icon"
import { Sheet } from "@/components/ui/sheet"

/**
 * Which groups a channel belongs to.
 *
 * Stays open as rows are toggled — a channel commonly goes into more than one
 * group, and closing after each would mean reopening the sheet to add the next.
 */
export const GroupMembershipSheet = forwardRef<
  BottomSheetModal,
  {
    channel: ChannelWithStreams | null
    groups: FavoriteGroup[] | undefined
  }
>(function GroupMembershipSheet({ channel, groups }, ref) {
  const { colors, iconPrimary } = useTheme()
  const toggleMembership = useToggleGroupMembership()

  return (
    <Sheet ref={ref} title="Groups" snapPoints={["60%"]}>
      <BottomSheetFlatList
        data={groups ?? []}
        keyExtractor={(group) => String(group.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListEmptyComponent={
          <Text className="font-sans text-muted-foreground py-6 text-center text-sm">
            No groups yet. Create one on the web app.
          </Text>
        }
        renderItem={({ item }) => {
          // Under either key the channel might have been added with.
          const member = channel
            ? isFavorited(channel, (key) => item.channelKeys.includes(key))
            : false

          return (
            <PressableScale
              preset="row"
              className="h-12 flex-row items-center gap-2 rounded-md px-2"
              onPress={() => {
                if (!channel) return
                select()
                toggleMembership.mutate({
                  groupId: item.id,
                  channelKey: favoriteKeyFor(channel),
                  member,
                  alsoRemove: channel.key,
                })
              }}
            >
              <GroupIcon icon={item.icon} size={16} color={iconPrimary} />
              <Text
                numberOfLines={1}
                className="font-rounded text-foreground flex-1 text-[15px] tracking-tight"
              >
                {item.name}
              </Text>

              {/* A filled box rather than a bare tick, so an unchecked row
                  still shows there is something to toggle. */}
              <View
                className="size-5 items-center justify-center rounded-md border"
                style={{
                  borderColor: member ? colors.primary : colors.border,
                  backgroundColor: member ? colors.primary : "transparent",
                }}
              >
                {member ? (
                  <Check size={13} color={colors["primary-foreground"]} />
                ) : null}
              </View>
            </PressableScale>
          )
        }}
      />
    </Sheet>
  )
})
