import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_UNEXPLORED_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792703866847, // Date.now() captured once for this entry.
    introducedIn: "2026.10.22.1",
    title: "March orders can target unexplored territory",
    why: "Picking an unexplored tile as a March To target cancelled the order, so a muster flag could never be sent into the unknown.",
    changes: [
      "March To now accepts unexplored tiles as targets; the flag fights and expands its way there, revealing the ground as it goes",
      "If the target turns out not to be land, the order is refused and the flag keeps its current orders"
    ]
  }
];
