import { forwardRef, useMemo, useState } from "react"
import { Text, TextInput, View } from "react-native"
import {
  BottomSheetFlatList,
  type BottomSheetModal,
} from "@gorhom/bottom-sheet"
import { Check, Search } from "lucide-react-native"

import type { BrowseFilter } from "@portalhop/shared/browse-filter"

import { useTheme } from "@/lib/theme"
import type { CategoryEntry } from "@/lib/filters"
import { CategoryVisual } from "@/components/category-visual"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Sheet } from "@/components/ui/sheet"

export const CategoriesSheet = forwardRef<
  BottomSheetModal,
  {
    categories: CategoryEntry[]
    filter: BrowseFilter
    onSelect: (category: CategoryEntry) => void
  }
>(function CategoriesSheet({ categories, filter, onSelect }, ref) {
  const { colors, iconPrimary } = useTheme()
  const [search, setSearch] = useState("")

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return categories
    return categories.filter((entry) => entry.genre.toLowerCase().includes(q))
  }, [categories, search])

  return (
    // Fixed height like the web drawer's 75dvh: the list is long and searchable,
    // so a content-sized sheet would resize under the search field as you type.
    <Sheet ref={ref} title="Categories" snapPoints={["75%"]}>
      <View className="px-4 pb-2">
        <View
          className="h-11 flex-row items-center gap-2 rounded-lg border px-3"
          style={{ borderColor: colors.border }}
        >
          <Search size={17} color={colors["muted-foreground"]} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Find a category"
            className="text-foreground flex-1 font-sans text-[15px]"
            placeholderTextColor={colors["muted-foreground"]}
            autoCorrect={false}
            textAlignVertical="center"
            style={{ paddingVertical: 0, includeFontPadding: false }}
          />
        </View>
      </View>

      {/* BottomSheetFlatList rather than a plain one: inside a sheet, a normal
          list fights the pan gesture and the sheet drags when you meant to
          scroll. */}
      <BottomSheetFlatList
        data={visible}
        keyExtractor={(entry) => `${entry.sourceId} ${entry.genre}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <Text className="text-muted-foreground py-6 text-center text-sm">
            No categories match.
          </Text>
        }
        renderItem={({ item }) => {
          const active =
            filter.type === "category" &&
            filter.genre === item.genre &&
            filter.sourceId === item.sourceId

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
              {/* The accent, as in the groups drawer. A drawer is a list of
                  things to pick between, so the icon is doing the picking out;
                  in a channel row the same icon only labels the category beside
                  the name, which is why that one stays muted. */}
              <CategoryVisual category={item.genre} color={iconPrimary} />
              <Text
                numberOfLines={1}
                className="font-rounded text-foreground flex-1 text-[15px] tracking-tight"
              >
                {item.genre}
              </Text>
              {active ? (
                <Check size={16} color={colors.foreground} />
              ) : (
                <Text className="text-muted-foreground font-mono text-xs">
                  {item.count.toLocaleString()}
                </Text>
              )}
            </PressableScale>
          )
        }}
      />
    </Sheet>
  )
})
