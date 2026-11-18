import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DEAL_PROFILE_LINK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Open an empire's profile from Diplomacy",
  why: "When you opened Diplomacy with an empire, there was no way to see their profile without leaving the deal and finding them in Ranks.",
  changes: [
    "In a Diplomacy deal, tap the empire's name or Profile ▸ to see their profile: rank, this season's numbers, career and pacts",
    "Closing that profile takes you back to the same deal"
  ]
};
