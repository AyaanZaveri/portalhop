# Android app (Capacitor)

The Android app is the same frontend as the web app, exported to static files
and packaged inside a [Capacitor](https://capacitorjs.com) shell. It has no
backend of its own: every `/api` call travels to a deployed Portal Hop instance
over the network.

```
APK
├─ Capacitor (Android WebView)
└─ out/            static export of the Next.js frontend
                        │
                        └── https://portalhop.vercel.app/api/*   (30 route handlers,
                                                                  Postgres, auth)
```

## Why it's split this way

The API routes hold the Postgres connection, the better-auth secret and the AES
key for saved source credentials. None of that can ship inside an APK, so the
routes stay on the server and only the UI is packaged. The UI was already almost
entirely client-rendered, so little had to change.

## Build

```bash
npm run android:build          # unsigned release APK
npm run android:build -- --debug   # debug-signed, installs without setup
```

Both write to `dist-android/`. The script runs the static export, `cap sync`,
and Gradle in one pass.

To point a build at a different backend:

```bash
NEXT_PUBLIC_API_BASE_URL=http://10.0.0.109:3000 npm run android:build
```

It defaults to `https://portalhop.vercel.app`.

### Installing

A release APK is unsigned and Android will refuse it. Either build with
`--debug`, or sign it yourself:

```bash
keytool -genkey -v -keystore portalhop.keystore -alias portalhop \
  -keyalg RSA -keysize 2048 -validity 10000

$ANDROID_HOME/build-tools/36.1.0/apksigner sign --ks portalhop.keystore \
  --out portal-hop-signed.apk dist-android/portal-hop-0.1.0-release.apk
```

Keep the keystore out of the repo.

## What differs from the web build

Everything below is switched on by `PORTALHOP_MOBILE_BUILD=1`, which only
`scripts/build-mobile-frontend.mjs` sets. The web build is unaffected.

| Concern | Web | Mobile |
| --- | --- | --- |
| Rendering | Server + client | `output: "export"`, fully static |
| API calls | Same-origin `/api/...` | `NEXT_PUBLIC_API_BASE_URL` + `/api/...` |
| Session | Cookie | Bearer token in `localStorage` |
| Service worker | Registered | Skipped — assets are already local |
| Image optimization | Next's optimizer | `unoptimized` (no server) |

### Static export required three changes

- **`src/app/api` and `src/middleware.ts` are moved aside during the export.**
  `output: "export"` refuses to build a project containing route handlers or
  middleware. The build script parks them and restores them afterwards,
  including on failure or Ctrl-C.
- **The channel route moved from `/tv/[channelId]` to `/tv?channel=<slug>`.**
  A dynamic path segment needs `generateStaticParams`, and channel ids only
  exist at runtime — there's nothing to enumerate at build time. See
  `src/hooks/use-active-channel.ts`.
- **Server-only page code became client code.** The two `redirect()` pages
  redirect in an effect, and `src/app/tv/layout.tsx` reads the browse-filter
  cookie from `document.cookie` instead of `next/headers`.

### Cross-origin auth

The webview serves the bundle from `https://localhost` (`androidScheme` in
`capacitor.config.ts`), a different site from the backend, so the session cookie
is never attached. better-auth's `bearer()` plugin (added in `src/lib/auth.ts`)
returns the session token in a `set-auth-token` response header;
`src/lib/api-fetch.ts` stores it and replays it as `Authorization: Bearer …` on
every request. `src/middleware.ts` adds the CORS headers that make this legal,
for the mobile origins only.

**This requires the backend to be redeployed.** An APK built against a
deployment that predates the `bearer()` plugin and the CORS middleware will fail
to sign in.

We deliberately do *not* enable Capacitor's `CapacitorHttp` plugin, which would
patch `window.fetch`/`XMLHttpRequest` to route through native HTTP and sidestep
CORS entirely. It breaks streaming responses, and this app depends on them in
two places: HLS segment loading in the player, and the progress stream from
`/api/portals/[id]/enrich`.

## Native behaviour

Android 15 forces apps to draw under the system bars and Android 16 removed the
opt-out, so `StatusBar.setOverlaysWebView` and `backgroundColor` no longer do
anything (this app targets SDK 36). Insets are the only supported mechanism:

- **`SystemBars` with `insetsHandling: "css"`** injects `--safe-area-inset-*`
  CSS variables. `globals.css` consumes them under `.native-app` with
  `env(safe-area-inset-*)` as the fallback, since older Android WebViews report
  `env()` as zero even when the app really is edge to edge.
- **`src/components/native-app-shell.tsx`** re-tints the system bar icons
  whenever the theme changes, because they now sit directly on the app's own
  background.
- **`Keyboard.resizeOnFullScreen`** works around the Android bug where a
  full-screen webview doesn't resize for the keyboard, which would otherwise
  hide focused inputs.
- **The splash screen is hidden by the app**, not on a timer, so there's no
  flash of an empty webview between splash and first paint.

The hardware back button keeps Capacitor's default behaviour: it walks back
through history and exits at the root, which is what the `?channel=` routing
makes correct — backing out of a channel returns to the list.

## Known limitation: Google sign-in

Google refuses OAuth inside embedded webviews (`disallowed_useragent`), so the
"Sign in with Google" button will not work in the APK. Email and password
sign-in works normally. Supporting it properly means opening the system browser
and handing the result back via a deep link, which is not implemented here.

## Toolchain

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

Gradle needs JDK 21; a newer JDK on `JAVA_HOME` will fail the build. The build
script falls back to the path above when `JAVA_HOME` is unset.

Regenerating icons and splash screens after changing `assets/logo.png`:

```bash
npx @capacitor/assets generate --android \
  --iconBackgroundColor "#0d0d0d" --splashBackgroundColor "#0d0d0d"
```
