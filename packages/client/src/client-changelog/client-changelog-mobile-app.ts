import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MOBILE_APP_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792511601822, // Date.now() captured for this entry.
    introducedIn: "2026.10.20.1",
    title: "Android and iOS app groundwork",
    why: "Preparing the game for native mobile testing and store submission.",
    changes: [
      "Mobile app builds bundle the game with email/password sign-in and guest play",
      "Guest players can save their empire with email and a password inside the app"
    ]
  }
];
