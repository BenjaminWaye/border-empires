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

## Store listing drafts

The App Store record uses English (U.K.); its text is prepared in
`apps/mobile/store/en-GB/apple.json`. English (U.S.) Apple and Google Play
drafts remain in `apps/mobile/store/en-US/`. These are editorial drafts, not store API payloads. Confirm
categories in each console rather than sending the labels as provider IDs.
Names, subtitles, keywords and descriptions fit the store text limits.
The owner supplied `benjamin@borderempires.com` for public support; copyright is
`2026 Benjamin Waye`, matching the individual Apple developer account. Private
review contact details were supplied in chat and must stay out of Git. Public
URLs, screenshots, age ratings and privacy declarations still need console/live verification.
Do not infer declarations from this copy or submit the draft review notes.

The release attempt on 2026-10-20 found Google Play blocked at developer
identity verification (the mobile identity-check connection was lost), Apple
App Store Connect signed out, and no valid Apple code-signing identity on the
Mac. Neither store received a binary or listing. Keep the existing app ID until
the owner confirms its registration in both consoles; do not create replacement
upload keys for an existing Play app without checking its registered key.

## Apple signing setup

The owner signed into Xcode on 2026-10-21. The iOS project and export options
now use the verified Benjamin Waye developer team `NZT5RV4VLD` with automatic
signing. Certificates and private keys stay in macOS Keychain, outside Git.
After syncing the intended production web bundle, build and export with:

```bash
pnpm --filter @border-empires/mobile archive:ios
pnpm --filter @border-empires/mobile export:ios
```

The signed archive is `apps/mobile/ios/App/output/BorderEmpires-signed.xcarchive`;
the export directory is `apps/mobile/ios/App/output/app-store/`. Exporting an
IPA does not upload it or submit it for review. If Xcode package resolution
tries a locked keychain, add `-packageAuthorizationProvider netrc` to the
archive command as described above.

The owner accepted the updated Apple Developer Program License Agreement on
2026-10-21. Border Empires now has its own App Store Connect record:
[app 6825524099](https://appstoreconnect.apple.com/apps/6825524099), bundle
`com.borderempires.game`, SKU `border-empires-ios`, primary locale `en-GB`.
The identifiers and initial upload are recorded in `apps/mobile/store/apple-app.json`.
Do not reuse the account's unrelated apps. Google Play verification was reported
complete by the owner on the same date.

On 2026-10-23 the Play Console was checked directly: Wayepoint studios is an
organisation account (`5127532228576010025`), the organisation/representative
documents are **in review**, and phone verification is gated on their approval.
There are no apps yet; **Create app is disabled** until account verification
finishes. Submitting the documents was successful, but approval is still pending.

On 2026-10-21 the signed device archive and App Store export both succeeded.
The exported `App.ipa` signature, explicit store provisioning profile, production
build metadata, bundle ID, clean source-commit marker and disabled debugger
entitlement were verified. Version 1.0, build 1 from commit `613b2bb8f` was
uploaded successfully with Xcode's automatic signing/account credentials.
The upload log reported that Apple accepted the package and began processing.
On 2026-10-22 TestFlight processing was verified. The encryption questionnaire
was completed with “None of the algorithms mentioned above”: the bundled client
and native plugins implement no encryption algorithms beyond platform networking
and random-number APIs. HTTPS/WSS use Apple's platform transport. TestFlight now
shows **Ready to Submit**, and build 1 is saved on the draft App Store version.
No testers have been invited; no App Review submission or public release has occurred.
Future builds declare `ITSAppUsesNonExemptEncryption=false` in `Info.plist`.
Reassess this declaration if encryption dependencies or functionality change.

The listing subtitle and Games → Strategy category were saved. Persistence of the
description, keywords and marketing URL was verified on 2026-10-22.
On 2026-10-23 the owner signed back into App Store Connect. The public support
URL, copyright and private review contact were saved and verified after reload.
Private contact details remain only in the console. Privacy policy and deletion
URLs were also saved. All ten App Privacy categories, collection purposes, user
linkage and no-tracking answers are configured; the final accuracy agreement
awaits the owner in the console. The age questionnaire was saved and Apple displays
13+ (with regional/older-OS exceptions). It declares player-created content,
infrequent profanity, frequent fantasy combat/weapons and competitive contests;
no free-form chat, social feed, advertising, gambling or paid loot boxes. Content
rights still need owner evidence; EU trader status remains incomplete. A new-app warning said
user access settings could not be saved and all existing team users have access;
review the App Information access settings if a restriction is intended.

To upload a future signed archive using the Xcode account, use a local copy of
`ios/ExportOptions.plist` with `destination` set to `upload`, then run
`xcodebuild -exportArchive -archivePath <archive> -exportOptionsPlist <options>
-allowProvisioningUpdates`. This performs an actual upload, so verify the intended
bundle, production environment and build number first. Increment the build number
for the next upload. Keep local credentials and private keys outside Git.
Rebuild/sync from the intended release commit before uploading; archive/upload
success is not a gameplay/device QA result.

## Required before store submission

These are existing product gaps, not tasks that signing the wrapper completes:

1. Deploy and verify the implemented in-app and public web deletion flows, including
   Firebase identity removal and the associated-data erasure procedure in
   [account-deletion.md](account-deletion.md). The operator must process the queue;
   game-data erasure is not an automatic background job. Verify backup expiry
   before publishing the current retention promise. Enter the public deletion URL in Play Console.
2. The privacy/terms/support pages now include the publisher and verified email.
   Publish reachable
   support/privacy/deletion URLs and complete App Privacy and Data Safety declarations
   against actual auth, first-party telemetry, social/chat, and server retention.
3. Review player-generated content moderation, reporting/blocking, age rating and
   audience settings. Supply review access/instructions for the persistent online game.
4. Supply verified store screenshots, descriptions, support contact, content rights,
   and final artwork review. The wrapper includes icons derived from the existing
   game favicon; store screenshots must come from the built native app.
5. Complete signing and internal device testing in the owner's Apple/Google accounts.
   Store acceptance is subject to each review process. The first iOS build has
   been uploaded, but neither store has received a review submission or release. If digital purchases are added, implement the applicable
   store billing flow before exposing purchase links in native builds.

Lore reviewed; no canon change. Packaging does not change gameplay or fiction.

## 2026-10-23 verification in progress

A real Firebase disposable-account probe verified identity deletion, receipt
idempotency, and rejection of the original signed token on both HTTP and WebSocket
auth paths. Erasure tests cover shared-world anonymisation, rollback and safe
restoration of older identity bindings. No existing player's data was altered.

An iPhone 17 Pro Max simulator reached the staging true-3D game as a guest and
rotated into landscape. That exposed a fixed-panel/camera-cutout overlap; the new
native `GameViewController` constrains the whole WebView to safe-area guides for
both renderers. Simulator builds succeed; the updated visual/device checks are
still in progress. No physical phone has been connected or verified.

The updated iPhone layout keeps the camera cutout clear in landscape; portrait
guest gameplay and opening/cancelling account deletion were verified. A real
1320×2868 portrait capture is preserved locally under
`apps/mobile/ios/App/output/screenshots/qa-20261023/`. It is a staging QA capture,
not proof of a production release. The 13-inch iPad simulator subsequently
launched and authenticated a staging guest. Its 3D map loaded slowly and offered
the low-performance prompt; switching to 2D preserved the empire. Portrait and
landscape 2D layouts, tile inspection, the complete deletion warning without
a keyboard, and cancellation were verified. Native 2064×2752 portrait and
2752×2064 landscape QA captures are preserved in the same ignored output directory.
This does not establish physical-device performance or pinch/pan behavior.

Local CI found a timer escaping the launch-only muster fixture into a later
simulation test. A regression reproduces the late events and the fixture now
freezes its scheduled callbacks before returning. The focused test passes.
The full local rerun was stopped to avoid competing with another worktree's
full CI on this Mac. GitHub CI run `39999361143` then completed successfully for
commit `098fa5513`, including static checks, all test shards and the final build gate.

The app-level privacy manifest and [native privacy inventory](../../apps/mobile/store/privacy-inventory.md)
record account, gameplay, first-party usage and optional support/diagnostic data.
They do not replace the App Privacy/Data Safety console declarations. Build 1
predates account deletion and these fixes: sync the production bundle and upload
a new build number after integration/QA, rather than submitting build 1.

## Primary references

- [Capacitor environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor configuration](https://capacitorjs.com/docs/config)
- [Apple review guidelines: login, privacy and deletion](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)

- [Firebase Auth dependency customization](https://firebase.google.com/docs/auth/web/custom-dependencies)

The Android API 36.1 emulator booted and the staging debug APK installed successfully.
The native UI connection was interrupted when the Mac locked before Android
gameplay could be verified. Both task test devices were then shut down to free
resources; their accounts/data and captures remain available. The Hetzner Cloud
console requires owner login to verify production backup settings.
