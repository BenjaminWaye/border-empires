// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_51: ClientChangelogEntry[] = [
  {
    createdAt: 1788876273396, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.02",
    title: "Hints and the new-player checklist now stay dismissed for good, and you can turn them off",
    why: "Discovery tips and the onboarding checklist only remembered what you'd dismissed in this browser's local storage, so clearing browser data or logging in on a different device made them reappear as if you'd never seen them.",
    changes: [
      "Dismissed discovery tips, the discovery-tip mute, and onboarding checklist completion are now saved on your account (server-side) instead of only in this browser, so they stay dismissed across devices and browser data clears",
      "Added a \"Show Hints\" checkbox under Settings > Gameplay to turn discovery tips off entirely"
    ]
  },
];