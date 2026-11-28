import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ANALYTICS_CONSENT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "You choose whether we measure your visits",
  why: "Usage analytics (Google Analytics) stores an identifier in your browser, so it should only run if you agree.",
  changes: [
    "On the website, a short question asks whether we may measure how Border Empires is used. Nothing is measured until you say yes.",
    "You can change your answer at any time in Settings, under Account. Turning it off also removes its cookies.",
    "The phone apps do not use analytics and do not ask."
  ]
};
