import { useState } from "react"
import { ActivityIndicator, Text, TextInput, View } from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { toast } from "sonner-native"

import { signIn } from "@/lib/auth"
import { PressableScale } from "@/components/ui/pressable-scale"

// Email and password only for now. Google works in principle via the Expo
// plugin's scheme redirect, but it needs a console change and is worth doing
// once the rest is proven.
export default function SignInScreen() {
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const { error } = await signIn.email({ email: email.trim(), password })
      if (error) {
        toast.error(error.message ?? "Could not sign in.")
        return
      }
      router.replace("/tv")
    } catch {
      toast.error("Something went wrong. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View
      className="bg-background flex-1 justify-center gap-4 px-6"
      style={{ paddingTop: insets.top }}
    >
      <Text className="font-heading text-foreground text-xl">Sign in</Text>

      <View className="gap-2">
        <Text className="font-sans text-muted-foreground text-sm">Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor="#737373"
          className="border-border text-foreground h-11 rounded-lg border px-3 font-sans text-[15px]"
        />
      </View>

      <View className="gap-2">
        <Text className="font-sans text-muted-foreground text-sm">Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          placeholder="At least 8 characters"
          placeholderTextColor="#737373"
          className="border-border text-foreground h-11 rounded-lg border px-3 font-sans text-[15px]"
        />
      </View>

      <PressableScale
        disabled={busy}
        onPress={submit}
        className="bg-primary mt-2 h-11 flex-row items-center justify-center gap-2 rounded-lg"
      >
        {busy ? <ActivityIndicator size="small" /> : null}
        <Text className="text-primary-foreground font-medium">Sign in</Text>
      </PressableScale>
    </View>
  )
}
