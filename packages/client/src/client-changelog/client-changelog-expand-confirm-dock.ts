import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const EXPAND_CONFIRM_DOCK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Tapping land next to your border waits for Confirm",
  why: "With the new bottom bar, tapping neutral land touching yours still claimed it at once, skipping the confirm step.",
  changes: [
    "Tapping neutral land next to your border now only selects it. It spends only when you press Expand To (above the tile or on the bar) or tap the tile again."
  ]
};
