// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_75: ClientChangelogEntry[] = [
  {
    createdAt: 1789249191259, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.13.04",
    title: "Galaxy View button moved above the minimap on mobile",
    why: "On mobile the 🌌 Galaxy View launcher was anchored just above the bottom nav bar, which put it below/behind the minimap panel instead of clear of it.",
    changes: [
      "On mobile, the Galaxy View launcher now sits above the minimap instead of tucked in behind it near the bottom nav bar"
    ]
  },
  {
    createdAt: 1789249191257, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.12.07",
    title: "Siege Battery rebuilt as an armored siege machine",
    why: "The old Siege Outpost looked like a rustic wooden watchtower with a catapult lashed to the roof — the visual language of a frontier camp rather than the heavy forward-deployed artillery it actually is. It's now a compact armored machine with a real silhouette: black-iron hull braced on stabilizer legs, a big forward siege cannon, and a spinning aether targeting head. Renamed from Siege Outpost to Siege Battery to match: it's a planted weapon, not a camp.",
    changes: [
      "The 3D map's Siege Battery is now a single armored siege machine — black-iron hull, aged-brass trim, four angled stabilizer legs, rear engine, and a large forward-facing cannon — planted on the tile like a piece of artillery instead of a wooden camp",
      "A small aether targeting head (cyan lens + violet ring) on the rear deck rotates slowly on both the 3D map and its 2D overlay art, matching the steampunk glow of the aether tech used by weapons foundries",
      "Both renderers get the new machine: the true-3D model is fully procedural and the 2D canvas overlay is a new 128px armored-machine sprite",
      "The battery now turns to aim itself at the nearest enemy tile it can see (both renderers) instead of always facing south — cosmetic only, it doesn't change range or combat odds",
      "Renamed from \"Siege Outpost\" to \"Siege Battery\" throughout the UI"
    ]
  }
];
