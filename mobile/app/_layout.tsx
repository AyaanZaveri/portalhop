import "../global.css"

import { useEffect, useState } from "react"
import { useColorScheme } from "nativewind"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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

import { getStoredTheme } from "@/lib/preferences"

SplashScreen.preventAutoHideAsync().catch(() => {})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The catalogue changes when a source is re-synced, not on a timer, so a
      // short stale window mostly generates pointless requests.
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme()
  const isDark = colorScheme === "dark"
  const tokens = isDark ? darkTokens : lightTokens

  // Applied once, synchronously from MMKV, before anything paints — an async
  // read would show the system scheme first and then snap to the saved one.
  useState(() => setColorScheme(getStoredTheme()))

  // Registered under the names tailwind.config.js maps to. Each weight is its
  // own family because Android does not synthesise bold.
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
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {})
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

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
