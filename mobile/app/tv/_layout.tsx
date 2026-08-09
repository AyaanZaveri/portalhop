import { ExperimentalStack } from "expo-router"

export default function TvLayout() {
  // A real navigator, unlike the web app's `?channel=` switch inside one
  // document — that only existed because a static export cannot do dynamic
  // segments. Android back now pops the stack without any handling of ours.
  return <ExperimentalStack screenOptions={{ headerShown: false }} />
}
