import { forwardRef, useCallback } from "react"
import { Text, View } from "react-native"
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet"
import { Check, LayoutGrid, Tv } from "lucide-react-native"

import type { SavedSourceRecord } from "@portalhop/shared/source-types"
import { useTheme } from "@/lib/theme"
import { PressableScale } from "@/components/ui/pressable-scale"

// The standard gorhom arrangement — a plain bottom sheet, not the web app's
// inset floating variant. Worth getting the ordinary one feeling right first.
export const PortalFilterSheet = forwardRef<
  BottomSheetModal,
  {
    portals: SavedSourceRecord[]
    selectedIds: Set<number>
    onChange: (ids: Set<number>) => void
  }
>(function PortalFilterSheet({ portals, selectedIds, onChange }, ref) {
  const { colors: tokens, iconPrimary } = useTheme()

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
      />
    ),
    [],
  )

  const toggle = (id: number) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <BottomSheetModal
      ref={ref}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: tokens.background }}
      handleIndicatorStyle={{ backgroundColor: tokens["muted-foreground"] }}
    >
      <BottomSheetView className="gap-1 px-4 pt-2 pb-8">
        {/* No description: the rows say what they do, and a sentence explaining
            a list of portals is just something to read past. */}
        <Text className="font-heading text-foreground mb-3 text-[22px] tracking-tight">
          Portals
        </Text>

        <PressableScale
          preset="row"
          onPress={() => onChange(new Set())}
          className="h-11 flex-row items-center gap-2 rounded-md px-2"
        >
          <LayoutGrid size={16} color={iconPrimary} />
          <Text className="font-rounded text-foreground flex-1 text-[15px]">
            All Portals
          </Text>
          {selectedIds.size === 0 ? (
            <Check size={16} color={tokens.foreground} />
          ) : null}
        </PressableScale>

        {portals.map((portal) => (
          <PressableScale
            key={portal.id}
            preset="row"
            onPress={() => toggle(portal.id)}
            className="h-11 flex-row items-center gap-2 rounded-md px-2"
          >
            <Tv size={16} color={iconPrimary} />
            <Text
              numberOfLines={1}
              className="font-rounded text-foreground flex-1 text-[15px]"
            >
              {portal.name}
            </Text>
            {selectedIds.has(portal.id) ? (
              <Check size={16} color={tokens.foreground} />
            ) : null}
          </PressableScale>
        ))}
      </BottomSheetView>
    </BottomSheetModal>
  )
})
