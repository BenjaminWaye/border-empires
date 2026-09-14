// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_45: ClientChangelogEntry[] = [
  {
    createdAt: 1788819326452, // frozen from `node -e "console.log(Date.now())"` -- was `Date.now()` on main, which check:client-changelog rejects (non-frozen) and which continuously invalidates the "keeps only the latest week" freshness window on every test run
    introducedIn: "2026.09.07.10",
    title: "Muster flag progress now animates smoothly instead of jumping every ~30s",
    why: "Manpower staged on a muster flag only updated server-side in sparse ticks, so the tile menu, manpower panel, and the 3D map's fill bar all showed frozen numbers for long stretches, then a visible jump. Sustained clicking/dragging traffic could also starve other queued actions (like the flag's own status updates) behind it indefinitely.",
    changes: [
      "The tile menu, manpower panel's Active muster flags list, and the 3D map's muster fill bar now interpolate a flag's staged amount continuously between server updates instead of holding flat then jumping",
      "The tile menu now repaints a muster tile's staged/cap readout roughly every 250ms while its menu is open, and the manpower panel's flag list now animates HOLD flags too (previously only Advance/March flags got a live repaint)",
      "Fixed a job-queue fairness issue where a steady stream of interactive commands (clicks, drags) could indefinitely starve background command types (including muster-flag status updates) queued behind them"
    ]
  },
  {
    createdAt: 1788814731427, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.09",
    title: "Fleets in flight are now visible in Space View's 3D scene",
    why: "Sending a fleet was invisible outside the Fleets panel -- the 3D galaxy scene had no idea a raid or recon mission was even underway. Nothing showed a fleet leaving your territory, traveling, or approaching its target.",
    changes: [
      "Each hull class (Scout, Raider, Battleline, Dreadnought, Tanker) now has its own distinct 3D ship model -- a small nosecone for Scout, a dart-shaped Raider, a plain Battleline hull, a larger spiked Dreadnought, and a tanker-shaped logistics hull for Tanker",
      "While your fleet is TRAVELING, its ships now fly a straight line from your territory to the target in the 3D scene, oriented to face the direction of travel, and land exactly when the order actually resolves server-side",
      "A fleet with a mixed composition shows one ship model per hull class present, arranged in a small formation, rather than a single generic marker",
      "New optional originSeasonId field on GET /hq/galaxy/fleets orders (your own first held territory at send time) purely powers this visual -- existing callers are unaffected, and a fleet from a player who holds no territory still gets a deterministic (if anonymous) launch point rather than being skipped",
      "This only shows your own fleets today -- there's no detection/visibility model yet for seeing an enemy fleet en route to your own territory"
    ]
  },
];
