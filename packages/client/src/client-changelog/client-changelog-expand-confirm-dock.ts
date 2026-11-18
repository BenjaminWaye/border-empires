import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const EXPAND_CONFIRM_DOCK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Tapping land next to your border waits for Confirm",
  why: "With the new bottom bar, tapping neutral land touching yours still claimed it at once, skipping the Confirm step.",
  changes: [
    "Tapping neutral land next to your border now only selects it. Expand To spends when you press Confirm, the bar's Expand To, or tap the tile again."
  ]
};
