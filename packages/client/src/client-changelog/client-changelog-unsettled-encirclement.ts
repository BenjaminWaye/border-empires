import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const UNSETTLED_ENCIRCLEMENT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Captured towns take the land they cut off",
  why: "Capturing a town turned the loser's nearby settled land into frontier, but land a step or more from the town was never checked for encirclement, so cut-off enemy frontier stayed inside your lines.",
  changes: [
    "When you capture a town, the loser's nearby settled land that drops to frontier is now checked for encirclement. If it is cut off and touches your land, it becomes yours; otherwise it goes neutral."
  ]
};
