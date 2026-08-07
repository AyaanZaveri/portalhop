import { forwardRef, useCallback, type ReactNode } from "react"
import { StyleSheet, Text } from "react-native"
import { BlurView } from "expo-blur"
import { useUniwind } from "uniwind"
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetModalProps,
} from "@gorhom/bottom-sheet"

import { useTheme } from "@/lib/theme"
import { blurAvailable, useBlurTarget } from "@/components/ui/blur-target"

/**
 * The app's one sheet shell, so every drawer shares a backdrop, a handle and a
 * heading rather than each rebuilding them. The web app's sheets are inset
 * floating panels; these are the ordinary gorhom kind for now, which is the
 * arrangement it is designed around.
 */
export const Sheet = forwardRef<
  BottomSheetModal,
  {
    /** Omit where the content says what the sheet is on its own. */
    title?: string
    children: ReactNode
    /** Omit to size to content, as the portals sheet does. */
    snapPoints?: BottomSheetModalProps["snapPoints"]
  }
>(function Sheet({ title, children, snapPoints }, ref) {
  const { colors } = useTheme()
  const { theme } = useUniwind()
  const blurTarget = useBlurTarget()

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        // Lighter where the blur is doing most of the separating; the two
        // stacked read as a blackout. Without blur the scrim is all there is,
        // so it goes back to carrying the separation on its own.
        opacity={blurAvailable ? 0.2 : 0.4}
      >
        {/* Nested in the backdrop rather than replacing it, so tap-to-close
            and the fade in and out still come from gorhom.

            The intensity is fixed and the backdrop's own opacity animates —
            animating blur radius per frame is the expensive way to do this and
            the one that stutters.

            dimezisBlurViewSdk31Plus: real blur through Android's RenderNode on
            12 and above, and nothing at all below it, where the only
            alternative is RenderScript and it is too slow to be worth having.
            The scrim underneath means those devices still get separation. */}
        {blurAvailable ? (
          <BlurView
            intensity={theme === "dark" ? 60 : 50}
            tint={theme === "dark" ? "dark" : "light"}
            // Android divides intensity by this before blurring, to bring its
            // perceived strength in line with iOS. At the default of 4 an
            // intensity of 32 blurs at an effective 8, which on a dark list is
            // indistinguishable from no blur at all.
            blurReductionFactor={2}
            // blurMethod, not experimentalBlurMethod — the latter is the
            // deprecated alias in SDK 57.
            blurMethod="dimezisBlurViewSdk31Plus"
            blurTarget={blurTarget ?? undefined}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </BottomSheetBackdrop>
    ),
    [theme, blurTarget],
  )

  const body = (
    <>
      {title ? (
        <Text
          className="font-heading text-foreground text-[22px] tracking-tight"
          // No top padding: the drag handle above already provides it.
          style={{ paddingHorizontal: 16, paddingTop: 0, paddingBottom: 14 }}
        >
          {title}
        </Text>
      ) : null}
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
