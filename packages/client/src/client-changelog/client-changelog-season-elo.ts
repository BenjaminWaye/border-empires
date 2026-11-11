import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SEASON_ELO_CHANGELOG: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  why: "Finishing well against strong rivals should count across seasons.",
  title: "Season ratings",
  changes: [
    "Every player now has an ELO rating, updated from their final rank when each season ends.",
    "Beating higher-rated players gains more; past seasons are rated too.",
    "Player profiles show current rating, last change and peak; tap ? to see how it is calculated."
  ]
};
