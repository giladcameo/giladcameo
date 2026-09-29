# Berlin Transit Live — native app wrapper

A [Capacitor 8](https://capacitorjs.com) project that wraps the repo's
`berlin-transit.html` in native Android and iOS shells. The web file stays the
single source of truth; `www/` is generated from it and is not committed.

## Get the Android app (no Android Studio needed)

GitHub Actions builds an APK on every push that touches `native-app/**` or
`berlin-transit.html` (workflow: `.github/workflows/native-app.yml`).

1. On GitHub open **Actions → "Native app (Android APK, iOS build check, Mac screensaver)"**
   (or press **Run workflow** to build on demand).
2. Open the latest green run, scroll to **Artifacts**, download
   **berlin-transit-debug-apk** (a zip — unzip it to get `app-debug.apk`).
3. Get the APK onto your phone (e.g. upload to Google Drive, email it, or
   download the artifact directly on the phone while logged into GitHub).
4. Tap the APK. Android will ask to allow **"Install unknown apps"** for the
   app you opened it from (Files / Chrome / Drive) — allow it, then **Install**.
   Play Protect may warn about an unknown developer; choose *Install anyway*.

Newer CI builds install over older ones (all debug APKs are signed with the
shared `android/app/debug.keystore`). If you previously installed a build made
elsewhere, uninstall it first.

### Signed release build (optional, for the Play Store)
Add these repository secrets (Settings → Secrets and variables → Actions) and
the workflow will also upload **berlin-transit-release** (signed `.apk` + `.aab`):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Create the keystore once with
`keytool -genkeypair -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`
and back it up — losing it means you can't update the Play Store listing.

## iOS

CI compiles the app for the iOS Simulator (unsigned) to prove the Xcode
project builds, and uploads it as **berlin-transit-ios-simulator-app** — this
only runs in a Mac's Simulator, not on an iPhone. Installing on a real iPhone
or publishing needs:
- an Apple Developer account ($99/year) for TestFlight / App Store (a free
  Apple ID can sideload from Xcode, but builds expire after 7 days), and
- either a Mac with Xcode (`npx cap open ios`, set your Team, Run / Archive),
  or extending the CI `ios` job with a signing certificate + provisioning
  profile to export an `.ipa`.

## Screensaver

The map has a screensaver mode: all UI hidden, dark theme, the map drifts
slowly around your station while live vehicles keep updating, with a dim
clock + station name. Tap/any key exits.

- **Anywhere (web or app):** tap **Screensaver** under the station name, or
  open `https://gcameo.com/berlin-transit.html?screensaver=1`.
- **Pick the station:** search or locate it as usual (the last station is
  remembered), or use `?station=<VBB stop id>&name=<label>`. The **Link**
  button copies a ready-made screensaver link for the current station.

### Android system screensaver
The APK includes a screensaver (`TransitDreamService`). After installing:
**Settings → Display → Screen saver** (on some phones: *Display → Advanced →
Screen saver*, or search "screen saver") → choose **Berlin Transit Live** →
set *When to start* (e.g. while charging). It uses the station you last
picked in the app. Needs network for live data.

### iPhone / iPad
iOS has no API for third-party screensavers, and StandBy only shows widgets
(no live maps). Instead:
- open the app, tap **Screensaver** (it keeps the screen awake), and lock the
  device into the app with **Guided Access** (Settings → Accessibility →
  Guided Access, then triple-click the side button); or
- in Safari, open the screensaver link and *Add to Home Screen* for a
  full-screen version (Safari may still dim the screen after Auto-Lock).

### Mac screensaver (`BerlinTransit.saver`)
1. GitHub **Actions** → latest green run → download
   **berlin-transit-mac-screensaver** and unzip → `BerlinTransit.saver`.
2. It is ad-hoc signed but not notarized (that needs a paid Apple Developer
   account), so Gatekeeper blocks it. Either run once in Terminal:
   `xattr -dr com.apple.quarantine ~/Downloads/BerlinTransit.saver`
   before installing, or double-click it, dismiss the warning, then go to
   **System Settings → Privacy & Security** and click **Open Anyway**.
3. Double-click `BerlinTransit.saver` → install (for you or all users).
4. **System Settings → Screen Saver** → **Berlin Transit** → **Options…**:
   search a station, or paste a *Link* copied from the web app. Default is
   Berlin Hauptbahnhof.

It loads the bundled page (Leaflet included, map tiles and live data from the
network). Build locally with `mac-screensaver/build.sh` (Xcode command line
tools + Node 22).

## Local development

```bash
npm ci               # Node 22+
npm run sync         # rebuild www/ from ../berlin-transit.html, then `cap sync`
npx cap open android # Android Studio (JDK 21, SDK 36)
npx cap open ios     # Xcode 26+ (Mac only)
```

`npm run sync-web` (`scripts/sync-web.mjs`) copies `../berlin-transit.html` to
`www/index.html` and, for the native copy only:
- bundles Leaflet 1.9.4 from `node_modules` into `www/vendor/leaflet/`
  (the map UI works without unpkg.com; map tiles still load from the network),
- adds `viewport-fit=cover` and safe-area padding (notch / status bar / gesture bar),
- injects `src/native.js`: status bar style follows the theme, Android back
  button closes search/expanded panel/route, otherwise minimizes the app.

`berlin-transit.html` itself only feature-detects `window.Capacitor`: it uses
the Capacitor Geolocation plugin for the locate button in the app and skips
service-worker registration there. On the web nothing changes.

Plugins: `@capacitor/geolocation`, `@capacitor/app`, `@capacitor/status-bar`,
`@capacitor-community/keep-awake` (screensaver mode).

### Icons / splash screens
The icon comes from the repo's 180×180 `icon.png`. For sharper icons:
```bash
npm install -D @capacitor/assets
mkdir -p assets && cp your-1024-icon.png assets/icon.png && cp your-splash.png assets/splash.png
npx capacitor-assets generate
```

See `../NATIVE_APP_GUIDE.md` for store submission steps and pitfalls.
