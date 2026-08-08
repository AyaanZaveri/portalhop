import { useState } from "react"
import { ScrollView, Text, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { ChevronLeft, Tv } from "lucide-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/lib/theme"
import { useSession } from "@/lib/auth"
import { usePortals } from "@/lib/channels"

import { CategoryVisual } from "@/components/category-visual"
import { ChannelLogo } from "@/components/channel-logo"
import { ChannelPlayer } from "@/components/channel-player"
import { ChannelSchedule } from "@/components/channel-schedule"
import { PressableScale } from "@/components/ui/pressable-scale"

export default function ChannelDetailScreen() {
  // Fullscreen is the screen's business, not just the player's: what makes the
  // video fill the display is the header and guide standing down, so the player
  // is left as the only thing with room to grow. Keeping it here also means the
  // VideoView never moves in the tree, and so never restarts.
  const [fullscreen, setFullscreen] = useState(false)
  const {
    name,
    xmltvId,
    channelId,
    portalId,
    savedChannelId,
    logo,
    genre,
    portalName,
  } = useLocalSearchParams<{
    slug: string
    name?: string
    xmltvId?: string
    channelId?: string
    portalId?: string
    savedChannelId?: string
    logo?: string
    genre?: string
    portalName?: string
  }>()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()

  // The portal record carries the EPG mode and, for a Stalker source, the
  // endpoint and credentials the guide request needs. Read from the cached
  // portals query rather than threaded through the route: it is small, already
  // in memory, and passing credentials through a URL would be worse.
  const { data: session } = useSession()
  const { data: portals } = usePortals(Boolean(session?.user))
  const portal = portals?.find((entry) => entry.id === Number(portalId))

  return (
    <View
      className="bg-background flex-1"
      style={{ paddingTop: fullscreen ? 0 : insets.top }}
    >
      {/* Logo, name, category and source — the same block the web's channel
          header carries, and the same logo treatment as a list row so a
          channel looks like itself on both screens. Stood down in fullscreen,
          which is what leaves the player the room to fill. */}
      {fullscreen ? null : (
        <View className="flex-row items-center gap-3 px-3 pt-2 pb-5">
          <PressableScale
            preset="icon"
            hitSlop={8}
            onPress={() => router.back()}
            className="size-9 items-center justify-center rounded-lg"
          >
            <ChevronLeft size={22} color={colors.foreground} />
          </PressableScale>

          <ChannelLogo uri={logo} />

          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={1}
              className="text-foreground font-rounded text-[17px] tracking-tight"
              style={{ lineHeight: 21, includeFontPadding: false }}
            >
              {name || "Live stream"}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              <CategoryVisual
                category={genre || "Uncategorized"}
                size={12}
                color={colors["muted-foreground"]}
              />
              <Text
                numberOfLines={1}
                className="text-muted-foreground shrink text-xs"
                style={{ lineHeight: 15, includeFontPadding: false }}
              >
                {genre || "Uncategorized"}
              </Text>
              {portalName ? (
                // The web's outline Badge. Which source a channel came from
                // matters most here, where you are about to watch it.
                <View
                  className="rounded-md border px-2 py-0.5"
                  style={{ borderColor: colors.border }}
                >
                  <Text
                    numberOfLines={1}
                    className="text-muted-foreground text-[10px]"
                    // The line height is what sized this badge before: 15pt of
                    // box around 10pt text, against 6pt of side padding, read as
                    // though the horizontal padding had gone missing. The box now
                    // hugs the text and the padding does the spacing.
                    style={{ lineHeight: 12, includeFontPadding: false }}
                  >
                    {portalName}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      )}

      {/* Outside the ScrollView on purpose: a scrolling child cannot flex to
          fill the screen, and this has to be able to. */}
      <ChannelPlayer
        sourceId={Number(portalId)}
        savedChannelId={Number(savedChannelId)}
        fullscreen={fullscreen}
        onFullscreenChange={setFullscreen}
      />

      {fullscreen ? null : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Icon and weight follow the web's guide heading. */}
          <View className="flex-row items-center gap-2 px-4 pt-6 pb-3">
            {/* Optically centred against the text rather than mathematically:
              the icon's mass sits low next to a cap-height word, so it reads
              as sunk when its box is aligned. The web nudges the same icon by
              the same amount with -mt-0.5. */}
            <Tv
              size={16}
              color={colors["muted-foreground"]}
              style={{ marginTop: -2 }}
            />
            <Text className="font-heading text-foreground text-base">
              Programme Guide
            </Text>
          </View>

          <ChannelSchedule
            portal={portal}
            channelId={channelId}
            channelName={name}
            xmltvId={xmltvId}
          />
        </ScrollView>
      )}
    </View>
  )
}
