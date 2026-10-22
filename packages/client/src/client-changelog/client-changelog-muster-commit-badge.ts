import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MUSTER_COMMIT_BADGE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792701389726, // Date.now() captured once for this release.
    introducedIn: "2026.10.22.2",
    title: "Muster flags grow to fit the manpower you commit",
    why: "Committing more manpower to an attack than a muster flag could hold left the flag stuck at its limit, and the attack waited on \"Mustering 0/60\" forever. The commit window also still used the old blue look, and the waiting banner covered the screen.",
    changes: [
      "When you commit more manpower to an attack than a muster flag can hold, using March To or Launch Attack, the flag's capacity now expands to fit it",
      "Switching a muster flag between Hold, Advance and March keeps the capacity you added with Expand Capacity",
      "The commit window uses the brass-and-leather look of the rest of the game, with a brass gauge slider, a large manpower readout and preset buttons that show their amounts",
      "An attack that is still gathering manpower now shows a percentage badge above its muster flag, on both the 3D and 2D maps, instead of the \"Mustering...\" banner. Esc still cancels it"
    ]
  }
];
