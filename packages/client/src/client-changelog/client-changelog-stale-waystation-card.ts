import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const STALE_WAYSTATION_CARD_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "No old waystation cards on a new empire",
  why: "Landing a new empire could show a waystation card from your previous empire, such as a population boost for a town you no longer hold.",
  changes: [
    "Waystation cards now only appear when you collect a waystation. Old rewards are no longer shown again.",
    "Nothing was granted by those repeat cards. Your past rewards are still in your Chronicle."
  ]
};
