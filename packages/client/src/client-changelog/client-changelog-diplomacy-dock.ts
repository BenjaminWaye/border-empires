import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DIPLOMACY_DOCK_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793133667745, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.1",
    title: "Diplomacy no longer pops up over the map",
    why: "Truce and alliance news took over the middle of the map in the same banner as battle results, vanished after 12 seconds even while an offer was still open, and sent you to the Alliances tab to answer it.",
    changes: [
      "Incoming truce and alliance offers wait in a small dock in the top-right corner, with the terms, a countdown and Accept / Decline buttons, until you answer or they expire. An offer that costs you coin or Shards asks you to tap Accept twice, and ✕ hides an offer to answer later in Alliances",
      "Truces and alliances starting, ending or breaking are listed in the Chronicle (Activity) timeline and the Activity feed instead of a popup, including a truce that ran out while you were away",
      "A rival breaking a truce with you still alerts you right away, since they can now attack you"
    ]
  }
];
