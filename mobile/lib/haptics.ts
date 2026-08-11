import { Platform } from "react-native"
import * as Haptics from "expo-haptics"

/**
 * What the app is allowed to feel like, in four kinds.
 *
 * Android names a constant for each of these gestures, and picking the named
 * one matters more than it sounds: the platform tunes them per device, and the
 * generic calls are tuned for something else. impactAsync is a *collision* —
 * the feel of one thing striking another — and asking for it when nothing has
 * landed is what makes a long press come out as a buzz rather than a tick.
 * selectionAsync reads like the right answer for a list and is not; on Android
 * it is a short vibration.
 *
 * iOS has no equivalent vocabulary, so the two selection kinds collapse onto
 * selectionAsync, which is already that platform's selection tick, and the
 * long press onto a soft impact, which is what its own context menus use.
 */

/** One row passing another mid-drag: fires in quick succession, so very soft. */
export function tick() {
  if (Platform.OS === "android") {
    void Haptics.performAndroidHapticsAsync(
      Haptics.AndroidHaptics.Segment_Frequent_Tick,
    )
    return
  }
  void Haptics.selectionAsync()
}

/**
 * Picking one of several: a source, a group, a category.
 *
 * Segment_Tick rather than the frequent one. They read the same on a good
 * device, but the frequent tick is documented as so soft that a phone unable to
 * produce it may produce nothing at all — fine when it is one of thirty during
 * a drag, not fine when it is the only answer to a tap.
 */
export function select() {
  if (Platform.OS === "android") {
    void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
    return
  }
  void Haptics.selectionAsync()
}

/**
 * Holding a row until it opens something.
 *
 * Android has a constant for this exact gesture, described as a long press that
 * results in an action being performed, and it is the same feedback every
 * native long press on the device produces. That is the tick the packaged web
 * build gets for free and this app was missing.
 */
export function longPress() {
  if (Platform.OS === "android") {
    void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press)
    return
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
}

/**
 * A row being picked up at the start of a drag.
 *
 * Android names this one too, as the moment a drag target has just been picked
 * up. It was the frequent tick, which is the same mistake as the long press: a
 * feedback specified to be soft enough to skip, used where it is the only
 * signal that the gesture took.
 */
export function dragStart() {
  if (Platform.OS === "android") {
    void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Drag_Start)
    return
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
}

/**
 * Something changed and is worth feeling: a favourite added, a refresh
 * released. A collision, because something did land.
 */
export function confirm() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
}
