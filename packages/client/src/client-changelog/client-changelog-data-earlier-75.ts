// Split out of client-changelog-data.ts purely to stay under the 500-line
// file cap -- still inside the "latest week" rolling window, so this file is
// imported and spread into CLIENT_CHANGELOG_ENTRIES like any other source.
import type { ClientChangelogEntry } from "./client-changelog.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_75: ClientChangelogEntry[] = [
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
  },
  {
    createdAt: 1789198795334, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.03",
    title: "Fixed: a shard that no longer exists could get stuck on your tile, refusing to collect",
    why: "A shard site that expired (or was already collected) while your tile was out of view could get stuck showing on your map forever. Reselecting the tile didn't help: the tile-detail refresh that's supposed to re-sync a tile treated a shard's absence as \"unchanged\" rather than \"gone\", and re-served the same phantom shard every time you looked. Pressing Collect Shard then failed with \"no shard present\" every single time -- silently, with only a muted line in the feed, so it looked like nothing had happened at all.",
    changes: [
      "A full tile-detail refresh now explicitly reports \"no shard here\" for your own tiles, so a stale shard disappears as soon as you select the tile",
      "A rejected Collect Shard now immediately pushes fresh tile detail for that tile, so a phantom shard clears itself instead of leaving you re-pressing a button that can't succeed",
      "A failed collect (shard or tile yield) now shows a proper \"Collect failed\" alert explaining why, instead of failing silently or with only a muted feed line"
    ]
  },
  {
    createdAt: 1789149360440, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.02",
    title: "Fixed: an already-staged muster flag could go missing from the tile menu after reloading or reconnecting",
    why: "Logging back in or reconnecting rebuilds your view of the map from a fresh server snapshot, but that snapshot never mentioned muster flags at all -- so a flag you'd already staged (Hold, Advance, or a March) could vanish from the tile menu and the manpower panel's Active muster flags list until the next server update touched it, which never happens for a flag already sitting at its cap.",
    changes: [
      "A muster flag now shows up correctly in the tile menu and manpower panel immediately after logging in or reconnecting, instead of only after the next server update or a manual click on that tile"
    ]
  }
];
