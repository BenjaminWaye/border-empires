import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_NEW_PLAYER_EXPERIENCE: ClientChangelogEntry[] = [
  {
    createdAt: 1790764935075,
    introducedIn: "2026.09.30.7",
    title: "A calmer first login",
    why: "New players were greeted by What's New, the Activity dashboard and the tutorial all at once, which buried what matters when you start.",
    changes: [
      "While you're still on the tutorial, the What's New popup and the Activity dashboard (Updates and World Pulse) no longer open on their own; you only see updates released after you started",
      "You can still open the Activity dashboard yourself at any time"
    ]
  },
  {
    createdAt: 1790765559759,
    introducedIn: "2026.09.30.8",
    title: "Empire Integrity is gentler on young empires",
    why: "Integrity punished a new empire for a shape it had no room to fix yet, so early growth felt penalised before you had a real border to defend.",
    changes: [
      "Empire Integrity now stays at 90% or higher until you have settled 50 tiles, however ragged your border is",
      "The low-integrity warning is now a few words (Coin, Growth) with a More info button, instead of a sentence",
      "Past 50 settled tiles the protection fades out gradually and is gone by 100 tiles, so there is no sudden drop. After that, integrity works as before"
    ]
  }
];
