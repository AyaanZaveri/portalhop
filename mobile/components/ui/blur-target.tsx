import { createContext, useContext, useRef, type ReactNode } from "react"
import { BlurTargetView } from "expo-blur"

type BlurTargetRef = React.ComponentRef<typeof BlurTargetView> | null

const BlurTargetContext = createContext<{
  current: BlurTargetRef
} | null>(null)

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
export function BlurTargetProvider({ children }: { children: ReactNode }) {
  const ref = useRef<BlurTargetRef>(null)

  return (
    <BlurTargetContext.Provider value={ref}>
      <BlurTargetView ref={ref} style={{ flex: 1 }}>
        {children}
      </BlurTargetView>
    </BlurTargetContext.Provider>
  )
}

export function useBlurTarget() {
  return useContext(BlurTargetContext)
}
