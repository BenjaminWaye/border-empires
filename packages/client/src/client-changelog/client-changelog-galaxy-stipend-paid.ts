import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GALAXY_STIPEND_PAID_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Galactic Stipends are now actually paid",
  why: "A Stipend was listed in your galaxy holdings after a season, but its payout never reached your galaxy balance.",
  changes: [
    "Each Stipend now pays its Influence into your galaxy balance once, shortly after the season ends.",
    "Stipends you earned in earlier seasons are paid now too.",
    "Stipends pay Influence only: galactic Production is a daily build rate that comes from holding territory, and a Stipend comes with none.",
    "Stipend amounts are shown in whole numbers, matching what is paid."
  ]
};
