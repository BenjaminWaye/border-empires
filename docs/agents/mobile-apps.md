# Android and iOS apps

Status: canonical runbook; native wrapper implemented, store submission blocked by the product work below.

## Layout and build

`apps/mobile` owns Capacitor configuration, Android Studio and Xcode projects,
launcher assets, and native bundle scripts. The game still lives in
`packages/client`. Both the canvas fallback and true-3D renderer run unchanged
inside the native WebView. The client bundle is shipped inside each binary;
the rewrite gateway/simulation continue to run on Hetzner. Do not add a remote
`server.url`, cleartext traffic, wildcard navigation permissions, or live updates.

Use Node 22+ and pnpm 9.12.0. iOS needs macOS and Xcode 26+; Android needs
Android Studio 2025.2.1+, its bundled JDK 21+, Android SDK 36 and build tools.
Minimum targets are iOS 15 and Android API 24. These follow the generated
Capacitor 8 projects; recheck the store's current target requirements at release.

```bash
pnpm install --frozen-lockfile
pnpm mobile:sync                       # bundled production client + both projects
pnpm mobile:ios                        # open Xcode
pnpm mobile:android                    # open Android Studio
MOBILE_ENV=staging pnpm mobile:sync     # explicit test build, same application ID
```

Staging and production share `com.borderempires.game` and cannot be installed
side by side. Always rerun `pnpm mobile:sync` without `MOBILE_ENV=staging` before
archiving a store build. Inspect `apps/mobile/www/build-environment.json`:
production must use `wss://api.borderempires.com/ws`. The bundle script sets the
gateway explicitly, rejects unknown environment names and excludes the admin
entry. Native runtime ignores browser backend overrides and does not treat its
local WebView host as a development server or enable localhost gameplay tools.

`pnpm mobile:sync` builds workspace dependencies first. The standalone mobile
`build` consumes those dependencies; its native output is isolated in
`packages/client/dist-native` and never writes into the browser distribution.
`pnpm build` also prepares the mobile web bundle; it does not compile/sign the
native projects or sync them. `pnpm mobile:sync` is required before native builds.
Generated web bundles, Gradle/Xcode output, signing keys and provisioning profiles
are ignored. Commit the native projects and Gradle wrapper, not machine paths.
Keep Android/iOS Capacitor versions aligned with the client core package.

Launcher/splash artwork derives from `apps/mobile/assets/logo.svg` (the existing
game favicon). Regenerate it with `pnpm --filter @border-empires/mobile assets`.

## Authentication and platform behavior

Native builds offer guest play and Firebase email/password sign-in/registration.
Firebase uses IndexedDB persistence with local-storage fallback and omits the
browser popup/redirect resolver, whose eager OAuth iframe breaks iOS startup.
Saving a guest links email/password credentials to its existing Firebase UID,
then refreshes the token and reloads. A conflicting email leaves the guest intact.
Uninstalling the app or clearing app data loses an unsaved guest.

Native builds hide the browser's Google/Twitch/Discord popups and magic links:
embedded OAuth popups and email links opened in a different browser cannot
reliably complete the current flow. Existing email accounts can reset their
password in the native login UI. Social-only users must establish email/password
access through a tested recovery/linking path first; do not promise social login in a store listing. Adding
native social login needs provider configuration, credential linking, and an
Apple-compliant equivalent login option before release.

Web login stays unchanged. GA web analytics initialization is skipped in native
builds; first-party game telemetry remains active. External anchor links and legal
pages open in the system browser sheet. App foreground events reach the existing
reconnect scheduler. The contained viewport and native inset handling protect
fixed controls without shifting either renderer's input coordinates. Deep links,
push notifications, billing, and background simulation are not implemented.
Rally invites use the selected remote gateway and public production/staging
share URLs; following an invite opens the web game until native deep links exist.

## Native build verification

```bash
pnpm --filter @border-empires/mobile lint
pnpm --filter @border-empires/mobile test
pnpm --filter @border-empires/client exec vitest run src/client-native src/client-app-runtime-env
pnpm mobile:sync
cd apps/mobile/android
./gradlew assembleDebug                # APK: app/build/outputs/apk/debug/
./gradlew bundleRelease                # unsigned AAB until signing is configured
```

Xcode: open `apps/mobile/ios/App/App.xcodeproj`, select the App scheme and an
iPhone simulator, then Run. For a CLI compile without signing:

```bash
xcodebuild -project apps/mobile/ios/App/App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/be-mobile-ios \
  CODE_SIGNING_ALLOWED=NO build
```

If Xcode or `ibtool` reports `iOS <version> Platform Not Installed`, install the
matching iOS component under Xcode → Settings → Components. Having an older
simulator runtime installed does not satisfy the selected Xcode platform.
For public Swift package resolution on a headless machine with a locked
keychain, `-packageAuthorizationProvider netrc` avoids using Xcode's keychain
credential store; these public Capacitor packages require no credentials.

Before external testing, verify on physical iPhone/iPad and Android devices:
guest login, email login/register/reset, restart persistence, save-guest UID and
territory continuity, conflicting email, both map renderers, pan/pinch/tile taps,
rotation/notches/home gesture area, keyboard and form scrolling, offline launch
and reconnect, background/foreground, Android Back, and external/legal links.
Use staging accounts for account-creation testing. Automated mocks and a simulator
compile do not establish that production Firebase/device flows work.

## Signing and upload

The initial application ID is `com.borderempires.game`. Reserve/confirm it in
both developer accounts before first submission; change Capacitor config and
both native project identifiers together if the owner's registered ID differs.

- Apple: choose the owner's Developer Team in Signing & Capabilities, assign the
  correct bundle ID, set marketing/build versions, Archive for a generic iOS
  device, then Distribute App to App Store Connect/TestFlight. Store signing
  credentials in Xcode/account tooling, never Git.
- Google: create the app in Play Console, use Play App Signing, create and safely
  back up an upload key, then Android Studio → Generate Signed Bundle → Android
  App Bundle. Increment `versionCode` for every upload and `versionName` for
  user-facing releases. Upload the signed AAB to internal testing first.
- Each release must rebuild/sync from the intended commit, verify production
  build metadata, and include device smoke tests before store review.

## Required before store submission

These are existing product gaps, not tasks that signing the wrapper completes:

1. Implement account deletion initiated inside the app, covering Firebase identity
   **and** associated gateway/simulation/profile/social data, with reauthentication
   and a documented retention policy. Deleting only the Firebase user is insufficient.
   Google also requires a public web path to request deletion, entered in Play Console.
2. Replace the draft wording and placeholder support contact in
   `packages/client/public/privacy.html` and review `terms.html`. Publish reachable
   support/privacy/deletion URLs and complete App Privacy and Data Safety declarations
   against actual auth, first-party telemetry, social/chat, and server retention.
3. Review player-generated content moderation, reporting/blocking, age rating and
   audience settings. Supply review access/instructions for the persistent online game.
4. Supply verified store screenshots, descriptions, support contact, content rights,
   and final artwork review. The wrapper includes icons derived from the existing
   game favicon; store screenshots must come from the built native app.
5. Complete signing and internal device testing in the owner's Apple/Google accounts.
   Store acceptance is subject to each review process; no app has been uploaded by
   this implementation. If digital purchases are added, implement the applicable
   store billing flow before exposing purchase links in native builds.

Lore reviewed; no canon change. Packaging does not change gameplay or fiction.

## Primary references

- [Capacitor environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor configuration](https://capacitorjs.com/docs/config)
- [Apple review guidelines: login, privacy and deletion](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)

- [Firebase Auth dependency customization](https://firebase.google.com/docs/auth/web/custom-dependencies)
