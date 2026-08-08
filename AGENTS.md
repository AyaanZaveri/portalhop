<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Browser Automation

Use the `agent-browser` skill for browser automation, screenshots, scraping, and web app testing.

Core workflow:
1. `agent-browser open <url>`
2. `agent-browser snapshot -i`
3. Interact with refs like `@e1`, `@e2`
4. Re-run `snapshot -i` after page changes

If a site blocks automation with a bot challenge, try a first-party public endpoint or a less protected public page before declaring the task blocked.

## The Expo app in `mobile/`

A native Android app beside the web app, not a replacement. Both read the same
API and share `packages/shared`, so a change in one shows up in the other.
`mobile/` sits outside the bun workspace; `@portalhop/shared` resolves through
Metro's `extraNodeModules`.

### What reaches the device, and what does not

JavaScript arrives over Metro — reload and it is there. Native code only ships
in an APK. Almost every confusing session here has started with a change that
looked broken but had simply never been built.

Adding a native module also breaks the *old* build: most call
`requireNativeModule` at import, which throws rather than degrading. Guard
anything native with `requireOptionalNativeModule` and require it lazily, so a
stale install loses the feature instead of the screen.

**Validate native changes locally rather than in CI.** Two minutes against
thirteen:

```bash
cd mobile/android
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home \
ANDROID_HOME=$HOME/Library/Android/sdk \
./gradlew :logo-analysis:compileDebugKotlin
```

Do not push after every commit. Pushing `mobile/**` triggers the APK workflow,
whose concurrency group cancels in-progress runs, so a run of quick pushes
produces no build at all. Batch them and push when a build is actually wanted.

`mobile/.gitignore` anchors `/android/` and `/ios/` on purpose. Unanchored they
match those names at *any* depth, which once swallowed a local module's entire
native source — and the build passed, because there was nothing left to fail on.

### Data

Queries persist to SQLite through `experimental_createQueryPersister`, one row
per query rather than one blob for the cache: twelve catalogues are about 9MB,
over what Android gives AsyncStorage, and a single blob would be parsed in full
before first paint.

A catalogue is keyed `["portal", id, updatedAt]` with `staleTime: Infinity`, so
freshness comes from the key changing. Anything meant to re-read channels has to
invalidate `["portal"]` explicitly — and it must, because favourites are stored
as channel keys and resolved against the catalogue. A favourite whose channel is
missing is dropped silently, which looks like favourites not syncing rather than
like a stale catalogue.

The guide uses two endpoints and they are not interchangeable. `/api/epg/now`
returns a six-hour window for a whole country and feeds the strips under list
rows. `/api/channel-epg` looks a month ahead for one channel, asks a Stalker
portal for its own guide, and resolves custom EPG sources by name — that is the
one the channel screen needs.

### Things that cost a day to learn

- **expo-video fullscreen is unusable.** Native controls are forced on, and on
  Android the JS runtime is *paused* — React controls cannot run over it. The
  player grows its own container instead.
- **expo-blur recursion crashes natively.** A `BlurView` inside its own
  `BlurTargetView` redraws the target every frame and takes the process down
  with no JS error. The sheet provider must sit outside the blur target.
- **FlashList v2** enables `maintainVisibleContentPosition` by default, which
  anchors rows and leaves a gap when data changes, and it memoizes nothing —
  every prop must be stable or the list never commits.
- **A gorhom sheet with no snap points** is measured by its `BottomSheetView`
  alone; anything outside that view draws on top of the content.
- **Uniwind compiles static class strings only.** A computed `className`
  silently produces nothing; use `style` there.
- **`Haptics.selectionAsync` is a vibration on Android**, not a tick. Use
  `performAndroidHapticsAsync(Segment_Frequent_Tick)`.
- **Release builds block cleartext HTTP.** Expo puts `usesCleartextTraffic` on
  the debug manifest only, so `http://` portal streams play in development and
  fail in production until `expo-build-properties` sets it.
- **`react-native-image-colors`' `average` ignores alpha**, and PNGs routinely
  store colour under transparent pixels — so it says nothing about whether a
  logo has a background. `modules/logo-analysis` measures alpha properly.
