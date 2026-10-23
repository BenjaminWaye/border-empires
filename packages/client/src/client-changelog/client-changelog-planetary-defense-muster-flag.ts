import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PLANETARY_DEFENSE_MUSTER_FLAG_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792614982607, // Date.now() captured once for this entry.
    introducedIn: "2026.10.21.4",
    title: "Nearby muster flags fund attacks on Planetary Defense",
    why: "Attacks on Planetary Defense tiles only counted manpower mustered on the exact tile you attacked from, so a full flag one tile over was ignored and the attack failed with \"stage manpower on this tile first\".",
    changes: [
      "Attacking a Planetary Defense tile now draws on your nearest ready muster flag, the same as attacking another empire",
      "The company marches from the flag before the attack fires, like any other muster-funded attack"
    ]
  }
];
