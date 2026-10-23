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
      "Every one of your muster flags shows a percentage badge above it, on both the 3D and 2D maps: a brass ring counts toward the attack it is gathering for, a green ring shows how full a flag on Hold is",
      "An attack waiting for manpower shows on its flag's badge instead of the \"Mustering...\" banner. Cancel it with Esc or with Cancel Queued Attack on the flag, and the activity feed confirms the cancel",
      "A waiting attack is only called off after 5 minutes without its flag gaining any manpower, so a big commitment can take as long as it needs to gather"
    ]
  }
];
