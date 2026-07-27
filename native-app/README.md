# Berlin Transit Live — native app wrapper

This folder is a [Capacitor](https://capacitorjs.com) project that wraps the
`berlin-transit.html` web app (from the repo root) in native iOS and Android
shells. It was scaffolded in a Linux container that has no Android SDK and no
Xcode/macOS, and whose network policy blocks Google's Maven repo
(`dl.google.com`) — so the code and config are complete and correct, but the
actual compile/build/run/submit steps need to happen on your own machine.

## What's already done

- `www/index.html` — the app, copied from `../berlin-transit.html`.
- `capacitor.config.json` — app id `com.gcameo.berlintransit`, name "Berlin Transit Live".
- `android/` — full Android Studio project (Gradle), with location permissions
  added to `AndroidManifest.xml`.
- `ios/` — full Xcode project, with `NSLocationWhenInUseUsageDescription` added
  to `Info.plist` so the location-permission prompt works.
- `@capacitor/geolocation` plugin installed for both platforms (backs the
  app's "locate me" button).

## What you need to do, on your own machine

### One-time setup
- **For Android:** install [Android Studio](https://developer.android.com/studio) (includes the SDK).
- **For iOS:** you need a Mac with [Xcode](https://apps.apple.com/us/app/xcode/id497799835) installed.
- `npm install` in this folder to pull down `node_modules` (not committed to git).

### Whenever you change `berlin-transit.html`
From this folder:
```bash
npm run sync-web   # copies ../berlin-transit.html into www/index.html, and the icon
npx cap sync        # pushes it into the android/ and ios/ native projects
```

### Android
```bash
npx cap open android
```
Opens the project in Android Studio. Hit Run to test on an emulator/device.
See `../NATIVE_APP_GUIDE.md` section 8 for the signed release + Play Store steps.

### iOS
```bash
npx cap open ios
```
Opens the project in Xcode (Mac only). Set your Apple Developer Team under
Signing & Capabilities, then Run. See `../NATIVE_APP_GUIDE.md` section 9 for
the archive + App Store Connect steps.

### Icons / splash screens
The app icon was generated from the repo's existing `icon.png`, which is only
180×180 — usable, but a higher-resolution source (1024×1024) would look
sharper on Retina/high-DPI screens. To regenerate from a better source image:
```bash
npm install -D @capacitor/assets
mkdir -p assets && cp your-1024-icon.png assets/icon.png && cp your-splash.png assets/splash.png
npx capacitor-assets generate
```

See `../NATIVE_APP_GUIDE.md` for the full step-by-step guide, including Play
Store / App Store submission and common pitfalls.
