import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_109: ClientChangelogEntry[] = [
  {
    createdAt: 1792869724355, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.2",
    title: "Troop carriers at dock landings",
    why: "An army crossing the sea should arrive aboard a landing carrier.",
    changes: ["Dock-to-dock attacks now show futuristic carriers sailing in, lowering their bow ramps and unloading infantry into combat. Carriers stay beached until the battle ends, on both 3D and 2D maps."]
  }
];
