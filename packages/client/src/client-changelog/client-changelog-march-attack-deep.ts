import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_ATTACK_DEEP_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792826152829, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.1",
    title: "Strike deep into enemy land with a march from a muster flag",
    why: "Picking an enemy tile far behind its border only offered a greyed-out Launch Attack or a long chain of expand-and-attack waypoints, when what you wanted was to send troops straight at it.",
    changes: [
      "An enemy tile you can't attack directly now offers March Attack from Flag for each of your nearest muster flags within march range, sending that flag on a March To order against it",
      "March Attack from New Flag raises a muster flag on your tile closest to the target, which marches as soon as it has gathered enough troops to attack",
      "Both open the usual March To commit window, so you choose how much manpower to send and see the win chance first"
    ]
  }
];
