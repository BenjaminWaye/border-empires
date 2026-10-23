# Native app privacy inventory

Status: source-audited on 2026-10-23; all ten Apple categories and their purposes,
identity linkage and no-tracking answers are saved. The owner must complete the
final accuracy agreement in App Store Connect. Google declarations remain pending.
This is evidence for completing App Privacy and Data Safety, not an API payload.

The native apps use Firebase Authentication, our Hetzner game servers and optional
support reports/game notifications delivered through Resend email. Operational
alerts may reach our private Slack workspace. They do not initialise
Google Analytics, use advertising SDKs, access IDFA, or track across other
companies' apps/sites. Guest accounts still have a Firebase UID and game profile.

| Information | Purpose | Evidence |
| --- | --- | --- |
| Display name / screen name | Multiplayer profile and visible game identity | `packages/client/src/client-auth-flow/`, gateway `sqlite-player-profile-store.ts` |
| Email address (saved accounts) | Authentication, account recovery and game notifications | Firebase Auth; gateway `sqlite-auth-binding-store.ts` |
| Firebase UID and player ID | Authentication, persistent game state, safety and first-party usage analysis | Gateway auth bindings and `player-funnel-tracker/` |
| Random installation/browser visitor ID | First-party acquisition funnel | `packages/client/src/client-acquisition-funnel/`; no IDFA or advertising identifier |
| Gameplay content | Territory, progression, alliances, rankings, shared-world state and feature analysis | Simulation checkpoint/event stores and gateway social/galaxy stores |
| App interactions | Session times and gameplay milestones | Gateway `player-funnel-tracker/`; sessions/acquisition records pruned after 180 days |
| Support content | Optional bug reports and suggestions sent to the support inbox through Resend | `packages/client/src/client-bug-report/`, gateway `http-routes/bug-report-routes.ts` and `email-alerts/bug-report-email-alert.ts` |
| Performance and diagnostic data | Connection/renderer performance, recent client/server events attached to reports | Client bug-report payload includes user agent, player ID/name and performance metrics |
| Other technical data, including IP address | Networking, abuse prevention and operational logs | Gateway HTTP handling/rate limits and rotated server logs |

Treat account-associated categories as linked to the user. Conservatively declare
the per-install identifier as linked too: it identifies a returning installation,
although acquisition rows are not joined to the Firebase account. None is used
for cross-company tracking or advertising. Network transport uses HTTPS/WSS.

Do not declare that no data is collected because guest play is available or
because the native Google Analytics initialisation is skipped. Do not add the
publisher's private Apple review phone to the collected-data inventory; the app
does not request players' phone numbers.

The Apple app-level `PrivacyInfo.xcprivacy` declares these categories and purposes.
The packaged Capacitor/Cordova manifests declare no required-reason APIs; source
inspection of the installed Capacitor 8.5.3, App 8.1.2 and Browser 8.0.5 found no
UserDefaults, file timestamp, disk-space or system-uptime API use requiring an
additional reason. Reaudit after plugin changes. An empty required-API list does
not mean an empty collected-data list.

For Google Play, map the evidence to Personal info (name, email and user IDs),
App activity (interactions and game/user content), App info and performance
(diagnostics/performance), Device or other IDs, and applicable technical data.
Account data is required for online guest gameplay; email/password and support
reports are optional. Confirm the actual console labels before saving. Service
providers process data on our behalf; check Google's service-provider exclusions
when answering its separate sharing question rather than calling all processing
"no third parties".

Deletion is initiated in Settings → Account or `/delete-account.html`, with recent
authentication and literal confirmation. Firebase login removal is immediate on
acceptance; associated game-data erasure/anonymisation is completed by the
operator within 30 days. [The erasure runbook](../../../docs/agents/account-deletion.md)
covers the queue, external support records, backups and restoration. Verify the
actual backup expiry before publishing the current 30-day backup claim.

Console submission also requires age/content ratings. Player display names are
user-generated content; assess reporting/moderation honestly. Do not infer the
answers from the absence of a general chat box.

References: [Apple data categories](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype),
[Apple collection purposes](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes),
[Capacitor privacy manifests](https://capacitorjs.com/docs/ios/privacy-manifest).
