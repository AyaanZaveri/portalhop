import { useCallback, useState, type ReactNode } from "react"
import {
  ActivityIndicator,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"
import * as Haptics from "expo-haptics"
import { RefreshCw } from "lucide-react-native"

import { useTheme } from "@/lib/theme"

/** How far the finger travels before letting go actually refreshes. */
const THRESHOLD = 72
/** Where the list rests while the refresh runs, so the spinner has room. */
const REST = 56
/** Past this the list stops following the finger, so it cannot be dragged off screen. */
const MAX = 120
/** Below 1: the list trails the finger, which is what makes the pull feel weighted. */
const FRICTION = 0.55

const SPRING = { damping: 18, stiffness: 180, mass: 0.7 }

export type PullToRefreshRenderProps = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}

/**
 * Pull to refresh that moves the list.
 *
 * The platform RefreshControl was what this had, and on Android that is a
 * spinner floating over content which never moves — no relationship between
 * the finger and the list, which is what made it feel bolted on.
 *
 * The gesture is enabled only while the list is already scrolled to the top,
 * which is what keeps it from fighting the scroll view: at the top a downward
 * drag has nothing to scroll, so there is nothing to arbitrate. Dragging the
 * other way fails the gesture immediately and hands the touch back.
 *
 * The list reports its own offset rather than this reaching into it — hence the
 * render prop, which hands `onScroll` to whatever is being wrapped.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>
  children: (props: PullToRefreshRenderProps) => ReactNode
}) {
  const { colors } = useTheme()
  const [atTop, setAtTop] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const pull = useSharedValue(0)
  // Whether the haptic for this drag has already fired, so crossing the
  // threshold taps once rather than on every frame beyond it.
  const armed = useSharedValue(false)

  const runRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
      pull.value = withSpring(0, SPRING)
    }
  }, [onRefresh, pull])

  const tap = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  const landed = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }, [])

  const pan = Gesture.Pan()
    // Only at the top. Everywhere else this is an ordinary scroll and the
    // gesture should not exist at all.
    .enabled(atTop && !refreshing)
    // Claims the touch only after a deliberate downward drag, and gives it
    // straight back if the finger goes up so the list still scrolls.
    .activeOffsetY(12)
    .failOffsetY(-6)
    .onUpdate((event) => {
      if (event.translationY <= 0) {
        pull.value = 0
        return
      }

      pull.value = Math.min(event.translationY * FRICTION, MAX)

      if (pull.value >= THRESHOLD && !armed.value) {
        armed.value = true
        // Lands as the threshold is crossed, so the user knows letting go will
        // refresh before they let go.
        runOnJS(tap)()
      } else if (pull.value < THRESHOLD && armed.value) {
        armed.value = false
      }
    })
    .onEnd(() => {
      const shouldRefresh = pull.value >= THRESHOLD
      armed.value = false

      if (shouldRefresh) {
        pull.value = withSpring(REST, SPRING)
        runOnJS(landed)()
        runOnJS(runRefresh)()
      } else {
        pull.value = withSpring(0, SPRING)
      }
    })

  const listStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pull.value }],
  }))

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      pull.value,
      [0, THRESHOLD * 0.6],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      // Trails the list's own travel, so it is revealed from under the header
      // rather than riding down with the rows.
      {
        translateY: interpolate(
          pull.value,
          [0, REST],
          [-8, 0],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          pull.value,
          [0, THRESHOLD],
          [0.7, 1],
          Extrapolation.CLAMP,
        ),
      },
      // Winds up as the threshold approaches, so the pull reads as loading
      // something rather than as an icon that happens to move.
      {
        rotate: `${interpolate(
          pull.value,
          [0, THRESHOLD],
          [0, 180],
          Extrapolation.CLAMP,
        )}deg`,
      },
    ],
  }))

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // A few points of slack: a list resting at the top reports small offsets
      // while it settles, and requiring exactly zero made the gesture
      // intermittent.
      const next = event.nativeEvent.contentOffset.y <= 2
      setAtTop((current) => (current === next ? current : next))
    },
    [],
  )

  return (
    <View className="flex-1">
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 6,
            left: 0,
            right: 0,
            alignItems: "center",
            zIndex: 1,
          },
          indicatorStyle,
        ]}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <RefreshCw size={18} color={colors["muted-foreground"]} />
        )}
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View className="flex-1" style={listStyle}>
          {children({ onScroll })}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
