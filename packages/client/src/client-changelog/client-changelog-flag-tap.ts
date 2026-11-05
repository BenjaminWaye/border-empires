import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FLAG_TAP_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793317161726, // Date.now() captured once for this entry.
    introducedIn: "2026.10.30.1",
    title: "Tapping a flag on a town is more reliable",
    why: "The first tap of a session on a town with your muster flag didn't count, so it took three taps to reach the town screen. Closing the flag's bar and tapping again also jumped straight into the town screen.",
    changes: [
      "The first tap on a town or support tile with your flag now always selects the flag, and a second tap opens the town screen.",
      "If you close the flag's bar (✕, Esc or tapping elsewhere), the next tap on that tile selects the flag again instead of zooming into the town."
    ]
  }
];
