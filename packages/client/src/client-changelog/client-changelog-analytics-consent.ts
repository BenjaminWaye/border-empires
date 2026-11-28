import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ANALYTICS_CONSENT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "You choose whether we measure your visits",
  why: "Usage analytics (Google Analytics) stores an identifier in your browser, so it should only run if you agree.",
  changes: [
    "On the website, a short question asks whether we may use Google Analytics to see how Border Empires is used. It runs only if you say yes.",
    "You can change your answer at any time in Settings, under Account, or by opening the game with ?analytics=ask. Turning it off also removes its cookies and identifier.",
    "The phone apps do not use Google Analytics and do not ask."
  ]
};
