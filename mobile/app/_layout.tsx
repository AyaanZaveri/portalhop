import "../global.css"

import { useEffect, useState } from "react"
import { Uniwind, useUniwind } from "uniwind"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { AppState } from "react-native"
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { experimental_createQueryPersister } from "@tanstack/query-persist-client-core"
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from "@expo-google-fonts/geist"
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
} from "@expo-google-fonts/geist-mono"
import { Montserrat_700Bold } from "@expo-google-fonts/montserrat"
import { useFonts } from "expo-font"
import { Stack } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { Toaster } from "sonner-native"

import { darkTokens, lightTokens } from "@portalhop/shared/theme/tokens"

import { loadThemePreference } from "@/lib/preferences"
import { sqliteStorage } from "@/lib/query-storage"
import { pruneExpiredSlots } from "@/lib/epg"

SplashScreen.preventAutoHideAsync().catch(() => {})

/**
 * Persisted per query rather than as one dehydrated cache.
 *
 * PersistQueryClientProvider writes the entire cache as a single blob, which
 * for this app means serialising every channel of every portal on each change
 * and parsing all of it back on the JS thread at launch. This variant keys each
 * query separately, so a portal is restored on its own and only the portals
 * actually in view are read.
 */
const persister = experimental_createQueryPersister({
  storage: sqliteStorage,
  prefix: "portalhop",
  // A catalogue is addressed by its source's updatedAt (see usePortalChannels),
  // so an entry is either current or unreachable — there is nothing for the
  // default 24h expiry to protect against, and expiring it only forces a
  // download the app already knows it does not need.
  maxAge: 30 * 24 * 60 * 60 * 1000,
  // Bump when the stored shape changes; mismatched entries are discarded rather
  // than deserialised into something the app no longer understands.
  buster: "v1",
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The catalogue changes when a source is re-synced, not on a timer, so a
      // short stale window mostly generates pointless requests.
      staleTime: 5 * 60 * 1000,
      retry: 1,
      // Restored data is served immediately and refetched behind it when stale,
      // which is what lets the list paint before the network answers.
      persister: persister.persisterFn,
      // Must outlive the process for anything to be worth persisting; the
      // default 5 minutes would evict entries before the next launch.
      gcTime: 30 * 24 * 60 * 60 * 1000,
    },
  },
})

export default function RootLayout() {
  const { theme } = useUniwind()
  const isDark = theme === "dark"
  const tokens = isDark ? darkTokens : lightTokens

  const [themeLoaded, setThemeLoaded] = useState(false)

  /**
   * Bringing the app back to the foreground counts as a refocus.
   *
   * On the web this is free — the browser fires focus events and TanStack
   * refetches stale queries on its own. React Native has no such event, and
   * resuming from the background remounts nothing, so without this the app
   * could sit on a week-old list until it was force quit.
   *
   * What this actually costs is three small requests, and only past the stale
   * window: the portal list, favourites and groups. Catalogues are keyed by
   * their source's updatedAt, so they come down only when one has genuinely
   * been re-synced.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active")
    })
    return () => subscription.remove()
  }, [])

  // Re-syncing a source gives its catalogue a new key, so the row holding the
  // previous one is never read again — nothing else would ever delete it.
  // Fire-and-forget: it touches only entries no query can reach.
  // Programmes that have already finished, likewise: the guide table tracks a
  // moving window rather than accumulating every schedule ever downloaded.
  useEffect(() => {
    void persister.persisterGc().catch(() => {})
    void pruneExpiredSlots().catch(() => {})
  }, [])

  // Resolved before the splash comes down, so the saved scheme is already in
  // place on the first frame rather than snapping a moment later.
  useEffect(() => {
    let cancelled = false
    void loadThemePreference().then((preference) => {
      if (cancelled) return
      Uniwind.setTheme(preference)
      setThemeLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Registered under the names global.css's @theme maps to. Each weight is
  // its own family because Android does not synthesise bold.
  const [fontsLoaded, fontError] = useFonts({
    "Geist-Regular": Geist_400Regular,
    "Geist-Medium": Geist_500Medium,
    "Geist-SemiBold": Geist_600SemiBold,
    "GeistMono-Regular": GeistMono_400Regular,
    "GeistMono-Medium": GeistMono_500Medium,
    "Montserrat-Bold": Montserrat_700Bold,
  })

  useEffect(() => {
    // Hide only once the fonts have resolved, so the first paint isn't a
    // fallback typeface swapping under the user a frame later.
    if ((fontsLoaded || fontError) && themeLoaded)
      SplashScreen.hideAsync().catch(() => {})
  }, [fontsLoaded, fontError, themeLoaded])

  if ((!fontsLoaded && !fontError) || !themeLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <BottomSheetModalProvider>
            <StatusBar style={isDark ? "light" : "dark"} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: tokens.background },
              }}
            />
            <Toaster />
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
