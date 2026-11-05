import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MOBILE_APP_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792511601822, // Date.now() captured for this entry.
    introducedIn: "2026.10.20.1",
    title: "Android and iOS app groundwork",
    why: "Preparing the game for native mobile testing and store submission.",
    changes: [
      "Mobile app builds bundle the game with email/password sign-in and guest play",
      "Guest players can save their empire with email and a password inside the app",
      "Rally invites from the app use public game links for the selected server"
    ]
  },
  {
    createdAt: 1792700099152, // Date.now() captured for this entry.
    introducedIn: "2026.10.22.1",
    title: "Account deletion and support",
    why: "Players need a direct way to remove their account and find privacy and support information.",
    changes: [
      "Settings → Account now lets guests and signed-in players confirm permanent account deletion",
      "A deletion receipt explains when associated game data will be removed or anonymised",
      "Public support and account-deletion pages provide the same flow outside the apps",
      "The iOS map and controls stay clear of the camera cutout in portrait and landscape"
    ]
  }
];
