# Turning Berlin Transit Live into native iOS/Android apps

This guide is written specifically for this repo: `berlin-transit.html` is a
static, no-build-tool, vanilla JS single page app (Leaflet map + `vbb.transport.rest`
API calls) that already ships as an installable PWA (`manifest.json` + `sw.js`,
standalone display, offline fallback). Because of that, you do **not** need to
rewrite the app in Swift/Kotlin or React Native — you need to wrap the existing
web app in a native shell. That's a few days of work, not months.

## Which path fits you

| Approach | Effort | Platforms | Real App Store/Play listing | Notes |
|---|---|---|---|---|
| **Capacitor** (recommended) | Low–medium | iOS + Android | Yes | Wraps your existing HTML/CSS/JS in a native WebView shell, gives native APIs (geolocation, splash screen, etc.), one codebase. |
| PWABuilder / TWA | Very low | Android only (iOS support is weak) | Yes (Android) | Fastest route to the Play Store, but iOS via PWABuilder produces a low-quality wrapper — not worth it for iOS. |
| Full native rewrite (Swift/Kotlin or React Native/Flutter) | High | iOS + Android | Yes | Only worth it if you outgrow the WebView (need deep native UI, background tracking, widgets, etc.). Not needed for v1. |

**Recommendation: Capacitor.** It's built exactly for this situation (static/PWA → native), maintained by the Ionic team, and both Apple and Google accept Capacitor apps without issue as long as the app does more than "just open a website" — which yours does (live map, offline caching, native install).

---

## 1. Prerequisites

- **macOS** is required to build/sign/submit the iOS app (Xcode only runs on macOS). Android can be built on any OS.
- Xcode (latest, from the Mac App Store) + Xcode Command Line Tools.
- Android Studio (for the Android SDK, emulator, and signing).
- Node.js 18+ and npm.
- Apple Developer account ($99/year) — required for App Store distribution and even for on-device testing on a real iPhone beyond 7 days.
- Google Play Developer account ($25 one-time).

## 2. Set up the Capacitor project

Capacitor wraps *built web assets*, so you point it at a folder containing your HTML/CSS/JS (your `berlin-transit.html` and friends), not your whole GitHub Pages repo.

```bash
mkdir berlin-transit-app && cd berlin-transit-app
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init "Berlin Transit Live" "com.gcameo.berlintransit" --web-dir=www
```

Create a `www/` folder and copy the app's static assets in:

```bash
mkdir www
cp ../giladcameo/berlin-transit.html www/index.html
cp ../giladcameo/manifest.json ../giladcameo/icon.png www/
```

Notes specific to this app:
- Rename `berlin-transit.html` → `www/index.html` so Capacitor loads it as the entry point.
- You can drop `sw.js` and the service-worker registration — inside a native WebView you don't need PWA offline caching the same way; Capacitor apps are already installed locally. Keeping it doesn't hurt, but it's redundant.
- The app calls `vbb.transport.rest` directly from client JS — this keeps working unchanged inside the WebView, since Capacitor apps can make normal HTTPS requests.

## 3. Add the native platforms

```bash
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
npx cap sync
```

This generates `android/` (an Android Studio project) and `ios/` (an Xcode project) inside your Capacitor project, both pre-wired to load `www/index.html`.

## 4. Wire up native permissions the app actually uses

Your locate/geolocation button (`navigator.geolocation`, referenced in `berlin-transit.html`) needs native permission entries or it'll silently fail on-device:

**Android** — install the plugin and it patches the manifest for you:
```bash
npm install @capacitor/geolocation
npx cap sync
```

**iOS** — you must manually add usage-description keys in `ios/App/App/Info.plist` (Xcode will otherwise crash the app on first location request):
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Berlin Transit Live uses your location to show nearby stops.</string>
```

## 5. Icons and splash screens

Use the existing `icon.png` as your source image (ideally provide a 1024×1024 master). Generate all required sizes automatically:

```bash
npm install @capacitor/assets --save-dev
npx capacitor-assets generate
```

This fills in Android's mipmap icons and iOS's `AppIcon.appiconset` / launch screen automatically from one source image.

## 6. Run it locally

Android (emulator or a USB-connected phone with Developer Mode/USB debugging on):
```bash
npx cap open android
# Run ▶ in Android Studio
```

iOS (simulator, or a real iPhone with your Apple ID signed into Xcode):
```bash
npx cap open ios
# Select a simulator or device, hit Run in Xcode
```

Test the golden paths: map loads, live departures fetch from `vbb.transport.rest`, station search works, "locate me" prompts for and receives location permission, theme toggle (light/dark) works, and the app survives being backgrounded/foregrounded (departures should refresh, not show stale data forever).

## 7. Whenever the web app changes

Every time you update `berlin-transit.html` in the main repo, sync the change into the native shell:

```bash
cp ../giladcameo/berlin-transit.html www/index.html
npx cap sync
```

Then rebuild in Android Studio / Xcode. (Optional next step: script this copy + `cap sync` so it's one command, or point Capacitor's `webDir` straight at a build step if you ever add a bundler.)

## 8. Android release build (Play Store)

1. In Android Studio: **Build → Generate Signed Bundle/APK**, choose **Android App Bundle (.aab)**.
2. Create a new upload keystore the first time (back it up somewhere safe — losing it means you can never update the app under the same listing again).
3. Create the app listing in the [Google Play Console](https://play.google.com/console): title, description, screenshots (phone + optionally tablet), feature graphic, privacy policy URL (required — even a simple static page saying "we don't collect personal data beyond device location used locally" is enough if that's accurate).
4. Set the content rating questionnaire, target audience, and data-safety form (declare that you access location, and whether/how it's transmitted — for VBB queries you're sending coordinates to `vbb.transport.rest`, so disclose that).
5. Upload the `.aab` to an Internal Testing track first, test on a real device via the Play Store's internal testing link, then promote to Production.
6. Review typically takes hours to a few days for updates, can be longer for the first submission.

## 9. iOS release build (App Store)

1. In Xcode: set your Team (Apple Developer account) under **Signing & Capabilities**, bump the version/build number.
2. **Product → Archive**, then **Distribute App → App Store Connect**.
3. In [App Store Connect](https://appstoreconnect.apple.com), create the app record: name, category (Navigation or Travel), screenshots for required device sizes, privacy policy URL, and fill out the **App Privacy** section (declare location data collection/use, matching what the app actually does).
4. Submit the build for review. Apple review is typically 24–48 hours but can flag anything that looks like "just a website in a wrapper" — this app clears that bar because it has real native behavior (installable, offline-capable, uses device location, custom native UI chrome), but be ready to explain the app's purpose in App Review notes if asked.
5. Consider a TestFlight beta first (invite yourself/friends) before public submission — catches signing/permission issues without waiting on full review.

## 10. Common pitfalls specific to this app

- **CORS/mixed content**: `vbb.transport.rest` is called over HTTPS already, so no changes needed there.
- **Geolocation on iOS Simulator**: the simulator doesn't have real GPS — use Xcode's **Debug → Location** menu to simulate a Berlin coordinate for testing.
- **Service worker conflicts**: if you keep `sw.js` registered inside the Capacitor WebView, an aggressive cache-first strategy can serve stale HTML after you update the app. Since you already have network-first for documents in `sw.js`, this is fine as-is, but simplest is to just drop the service worker in the native build (step 2) since Capacitor doesn't need it.
- **App Store rejection reason to avoid**: Apple sometimes rejects thin WebView wrappers under guideline 4.2 ("Minimum Functionality"). Mitigate this by keeping native touches: real app icon/launch screen, native geolocation permission prompt, works offline for cached data, and no visible "open in browser" affordance that makes it look like a bookmarked website.

## Suggested order of operations

1. Get Capacitor + Android working first (free dev account, faster iteration) — validate the whole flow end to end.
2. Once Android is solid, mirror the same `www/` folder into the iOS project and go through Apple's signing/TestFlight/App Store flow.
3. Only consider a full native rewrite later, if you need capabilities the WebView genuinely can't provide (e.g., background live-activity widgets on iOS lock screen, home-screen widgets on Android).
