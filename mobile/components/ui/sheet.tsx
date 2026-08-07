import {
  forwardRef,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { Pressable, StyleSheet, Text, type View } from "react-native"
import { BlurView } from "expo-blur"
import { useUniwind } from "uniwind"
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
} from "react-native-reanimated"
import {
  BottomSheetModal,
  BottomSheetView,
  useBottomSheet,
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
      <BlurBackdrop
        {...props}
        blurTarget={blurTarget}
        dark={theme === "dark"}
      />
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

/**
 * The sheet backdrop: a blur that is simply present or absent, under a scrim
 * that fades.
 *
 * Nesting the BlurView inside gorhom's own backdrop put it under a parent whose
 * opacity is animated, and an animated opacity makes Android render that parent
 * into a hardware layer. Dimezis BlurView captures its target at draw time, and
 * that capture does not survive being composited through such a layer — the
 * blur resolved its target correctly and then drew nothing, silently.
 *
 * So nothing animates the blur itself. It is mounted while the sheet is open
 * and unmounted when it is not, which costs the fade on the way in and is the
 * price of it working at all. The scrim over it still fades, and carries the
 * transition.
 */
function BlurBackdrop({
  animatedIndex,
  style,
  blurTarget,
  dark,
}: BottomSheetBackdropProps & {
  blurTarget: { current: View | null } | null
  dark: boolean
}) {
  const { close } = useBottomSheet()
  const [open, setOpen] = useState(false)

  // Mount and unmount rather than fade, for the reason above.
  useAnimatedReaction(
    () => animatedIndex.value > -1,
    (isOpen, was) => {
      if (isOpen !== was) runOnJS(setOpen)(isOpen)
    },
  )

  useEffect(() => {
    if (__DEV__ && open) {
      console.log(
        `[portalhop] blur mounted, target=${blurTarget?.current ? "resolved" : "null"}`,
      )
    }
  }, [open, blurTarget])

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      animatedIndex.value,
      [-1, 0],
      [0, blurAvailable ? 0.2 : 0.4],
      Extrapolation.CLAMP,
    ),
  }))

  return (
    <Pressable style={style} onPress={() => close()}>
      {open && blurAvailable ? (
        <BlurView
          intensity={dark ? 48 : 42}
          tint={dark ? "dark" : "light"}
          // blurReductionFactor is left at its default of 4, which Android
          // divides the intensity by. It was overridden to 2 while the blur was
          // being blamed for rendering too weakly — it was not rendering at
          // all, for an unrelated reason, so the override was compensating for
          // something that was never the cause and left the radius doubled.
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={blurTarget ?? undefined}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "#000" },
          scrimStyle,
        ]}
      />
    </Pressable>
  )
}
