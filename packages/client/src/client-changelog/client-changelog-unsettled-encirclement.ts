import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const UNSETTLED_ENCIRCLEMENT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Captured towns take the land they cut off",
  why: "Capturing a town turned the loser's nearby settled land into frontier, but land a step or more from the town was never checked for encirclement, so cut-off enemy frontier stayed inside your lines.",
  changes: [
    "Settled land that drops to frontier when a rival's reach overtakes it is now checked for encirclement straight away. If it is cut off and touches the land of the player whose reach took it, it becomes theirs; otherwise it goes neutral."
  ]
};
