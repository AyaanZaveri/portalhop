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
  useAnimatedProps,
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
 * Animating `intensity` is supported on purpose: BlurView exposes
 * getAnimatableRef so Reanimated drives the native view directly rather than
 * re-rendering it. Created once, at module scope, because
 * createAnimatedComponent inside a render remounts the view every pass.
 */
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView)

/**
 * Intensity at rest, before Android divides it by blurReductionFactor (4).
 *
 * Dark carries more than light, and by more than it looks: 26 was arriving as
 * an effective radius of six and a half, which is barely a blur -- enough to
 * take the edge off a row and not enough to say the list is behind something.
 * Light needs less, because a light scrim over light content already separates
 * the two; a dark one over dark content has only the blur to do it with.
 */
const BLUR_DARK = 42
const BLUR_LIGHT = 22

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
    /**
     * Whether to blur what is behind, or just darken it.
     *
     * On for every sheet but one. A blur samples the view hierarchy, and a
     * video is not in it — it is a native surface composited separately, so the
     * snapshot comes back with a hole where the picture is and the sheet floats
     * over a page that is blurred everywhere except the one thing you were
     * looking at. A scrim treats them alike, which is worse in principle and
     * better on the screen.
     */
    blur?: boolean
  }
>(function Sheet({ title, children, snapPoints, blur = true }, ref) {
  const { colors } = useTheme()
  const { theme } = useUniwind()
  const blurTarget = useBlurTarget()

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BlurBackdrop
        {...props}
        blurTarget={blurTarget}
        dark={theme === "dark"}
        blur={blur}
      />
    ),
    [theme, blurTarget, blur],
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
 * The sheet backdrop: a blur that follows the sheet, under a scrim that fades.
 *
 * Both track `animatedIndex`, so dragging the sheet down thins the blur out
 * with it and letting go part-way leaves the two in step — the blur reads as
 * attached to the sheet rather than as something switched on behind it.
 *
 * The one thing that must not animate is the blur's *opacity*, which is why
 * this exists rather than nesting a BlurView in gorhom's own backdrop. That
 * backdrop animates opacity, and an animated opacity makes Android render the
 * parent into a hardware layer; Dimezis BlurView captures its target at draw
 * time and that capture does not survive being composited through such a
 * layer. The blur resolved its target correctly and then drew nothing at all.
 * Intensity is a native prop on the blur view itself, so driving that is safe
 * where fading its parent was not.
 */
function BlurBackdrop({
  animatedIndex,
  style,
  blurTarget,
  dark,
  blur,
}: BottomSheetBackdropProps & {
  blurTarget: { current: View | null } | null
  dark: boolean
  blur: boolean
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

  // Tracks the sheet rather than sitting at one value: fully blurred at rest,
  // thinning out as the sheet is dragged down, so letting go part-way looks
  // like the blur is attached to the sheet instead of switching off with it.
  const blurProps = useAnimatedProps(() => ({
    intensity: interpolate(
      animatedIndex.value,
      [-1, 0],
      [0, dark ? BLUR_DARK : BLUR_LIGHT],
      Extrapolation.CLAMP,
    ),
  }))

  // Heavier without the blur, because then it is the only thing saying the
  // page has gone behind something — the same figure a build without the
  // native module falls back to.
  const blurring = blur && blurAvailable
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      animatedIndex.value,
      [-1, 0],
      [0, blurring ? 0.2 : 0.4],
      Extrapolation.CLAMP,
    ),
  }))

  return (
    <Pressable style={style} onPress={() => close()}>
      {open && blurring ? (
        <AnimatedBlurView
          animatedProps={blurProps}
          tint={dark ? "dark" : "light"}
          // blurReductionFactor stays at its default of 4, which Android
          // divides the intensity by. It was briefly overridden to 2 while the
          // blur was being blamed for rendering too weakly — it was not
          // rendering at all, for an unrelated reason, so that override was
          // compensating for something that was never the cause.
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
