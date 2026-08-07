import { createContext, useContext, useRef, type ReactNode } from "react"
import { requireOptionalNativeModule } from "expo"
import { BlurTargetView } from "expo-blur"

type BlurTargetRef = React.ComponentRef<typeof BlurTargetView> | null

/**
 * Whether the running binary actually contains expo-blur.
 *
 * JavaScript reaches a development build over the network while its native code
 * does not, so an install from before a native module was added will happily
 * run code that references a view it has never heard of. Here that view wraps
 * the whole app, so without this check a stale build does not lose its blur —
 * it fails to render anything at all.
 */
export const blurAvailable = requireOptionalNativeModule("ExpoBlur") !== null

const BlurTargetContext = createContext<{ current: BlurTargetRef } | null>(null)

/**
 * What Android blurs.
 *
 * iOS blurs whatever happens to be behind a BlurView, so it needs none of
 * this. Android has no such thing: expo-blur has to be told which subtree to
 * sample, by wrapping it in a BlurTargetView and handing that ref to the
 * BlurView. The ref travels by context because the thing being blurred is the
 * whole app, while the thing doing the blurring is a sheet backdrop several
 * levels away.
 *
 * This works only because gorhom portals its sheets into the provider that
 * lives inside here. A backdrop inside a React Native Modal would be in a
 * separate native window and could not reach this subtree at all —
 * expo/expo#44165.
 */
export function BlurTargetProvider({
  backgroundColor,
  children,
}: {
  /**
   * The theme's background, painted on the target itself.
   *
   * Android clears each blur frame with the window background before drawing
   * the sampled snapshot, and the window background is whatever the base theme
   * gives it — pale, since nothing here sets it. Anywhere the sampled content
   * is not fully opaque, that pale clear shows through as a wash over the blur.
   * Painting the target opaque leaves the blur nothing to see past.
   */
  backgroundColor: string
  children: ReactNode
}) {
  const ref = useRef<BlurTargetRef>(null)

  if (!blurAvailable) return <>{children}</>

  return (
    <BlurTargetContext.Provider value={ref}>
      <BlurTargetView ref={ref} style={{ flex: 1, backgroundColor }}>
        {children}
      </BlurTargetView>
    </BlurTargetContext.Provider>
  )
}

export function useBlurTarget() {
  return useContext(BlurTargetContext)
}
