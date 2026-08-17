// Older client-changelog entries, split out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (see the comment at its top). Same
// shape and rules apply here: unordered, append-only, frozen createdAt literals.
// client-changelog-data.ts merges this array into CLIENT_CHANGELOG_ENTRIES.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER: ClientChangelogEntry[] = [
  {
    createdAt: 1786530000000, // 2026.08.12.3
    introducedIn: "2026.08.12.3",
    title: "Muster ADVANCE flags launch one attack at a time",
    why: "A flag set to ADVANCE re-searched on every automation tick, so it could fire a second attack while its first was still resolving — and an underfunded flag kept re-sending a doomed strike every tick. A flag now waits for its in-flight attack to resolve before launching another, and only fires when it can actually afford the target.",
    changes: [
      "Muster flags in ADVANCE mode now wait for their current attack to resolve before launching another.",
      "A flag that can't afford an attack no longer sends the strike to the server at all."
    ]
  },
  {
    createdAt: 1786547200000, // 2026.08.12.11
    introducedIn: "2026.08.12.11",
    title: "New 3D dock overlay and matching 2D icon: a working cargo-crane pier",
    why: "Docks used a placeholder timber-deck look with a mast and flag that read as a boatyard — none of it said 'this tile is how goods move across the ocean'. Replaced it with an actual working port scene: the dock is now a heavy timber-and-iron pier with a large brass cargo crane actively hoisting a crate over the loading deck, backed by a steam winch, boiler and pipe run, a compact dockhouse with amber-lit windows, mooring posts chaining a small steampunk cargo barge alongside, and crates, barrels and lamps that make the pier feel busy and lived-in.",
    changes: [
      "Docks now render a dedicated 3D cargo port: timber-and-iron pier, tall brass rotating cargo crane with a visibly suspended crate, steam winch and boiler, compact dockhouse, moored steampunk cargo barge, mooring chains, and small amber lamps.",
      "The 2D dock icon (used where the 3D renderer is off) matches the new look: same crane, pier, cargo and barge, with strong dark outlines so it still reads at a glance.",
      "Docks are unchanged mechanically — this is purely the on-map look."
    ]
  }
];
