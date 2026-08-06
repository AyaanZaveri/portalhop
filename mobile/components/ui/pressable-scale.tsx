import { forwardRef } from "react"
import { Pressable, type PressableProps, type View } from "react-native"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// The web app's press feedback, which is a scale rather than the opacity fade
// TouchableOpacity gives you — that difference is most of why one feels like an
// app and the other feels like a website. Curve and durations are the web's
// --ease-out and its transition timings.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

const PRESETS = {
  /** Buttons: active:scale-[0.985] at 160ms. */
  button: { scale: 0.985, duration: 160 },
  /** Icon buttons: active:scale-[0.97] at 160ms. */
  icon: { scale: 0.97, duration: 160 },
  /** List rows: active:scale-[0.99] at 100ms — quicker, since rows are large. */
  row: { scale: 0.99, duration: 100 },
} as const

export type PressableScalePreset = keyof typeof PRESETS

export const PressableScale = forwardRef<
  View,
  PressableProps & { preset?: PressableScalePreset }
>(function PressableScale({ preset = "button", onPressIn, onPressOut, ...props }, ref) {
  const { scale, duration } = PRESETS[preset]
  const pressed = useSharedValue(1)

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pressed.value }],
  }))

  return (
    <AnimatedPressable
      ref={ref}
      style={style}
      onPressIn={(event) => {
        pressed.value = withTiming(scale, { duration, easing: EASE_OUT })
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        pressed.value = withTiming(1, { duration, easing: EASE_OUT })
        onPressOut?.(event)
      }}
      {...props}
    />
  )
})
