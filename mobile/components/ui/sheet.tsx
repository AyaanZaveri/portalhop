import { forwardRef, useCallback, type ReactNode } from "react"
import { Text } from "react-native"
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetModalProps,
} from "@gorhom/bottom-sheet"

import { useTheme } from "@/lib/theme"

/**
 * The app's one sheet shell, so every drawer shares a backdrop, a handle and a
 * heading rather than each rebuilding them. The web app's sheets are inset
 * floating panels; these are the ordinary gorhom kind for now, which is the
 * arrangement it is designed around.
 */
export const Sheet = forwardRef<
  BottomSheetModal,
  {
    title: string
    children: ReactNode
    /** Omit to size to content, as the portals sheet does. */
    snapPoints?: BottomSheetModalProps["snapPoints"]
  }
>(function Sheet({ title, children, snapPoints }, ref) {
  const { colors } = useTheme()

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

  const body = (
    <>
      <Text
        className="font-heading text-foreground text-[22px] tracking-tight"
        // No top padding: the drag handle above already provides it.
        style={{ paddingHorizontal: 16, paddingTop: 0, paddingBottom: 14 }}
      >
        {title}
      </Text>
      {children}
    </>
  )

  return (
    <BottomSheetModal
      ref={ref}
      enablePanDownToClose
      snapPoints={snapPoints}
      // v5 defaults this to true, which sizes the sheet to its content and
      // quietly overrides snapPoints — with a list inside, it measured almost
      // nothing and the sheet opened as a sliver. Dynamic sizing is still what
      // we want when no snap point is given, as on the portals sheet.
      enableDynamicSizing={!snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors["muted-foreground"] }}
    >
      {/* Dynamically sized sheets have to put everything inside one
          BottomSheetView, because that is what gorhom measures to decide the
          sheet's height. With the heading left outside it, the sheet sized
          itself to the content alone and the title drew on top of it. A sheet
          with snap points has a height already and needs no wrapper — its
          child is usually a BottomSheetFlatList, which must not be nested in
          a view that would cap its scroll. */}
      {snapPoints ? body : <BottomSheetView>{body}</BottomSheetView>}
    </BottomSheetModal>
  )
})
