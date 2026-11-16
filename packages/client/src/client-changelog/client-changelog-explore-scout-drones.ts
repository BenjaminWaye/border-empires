import type { ClientChangelogEntry } from "./client-changelog-data.js";

// The Explore launch entry and the scout drone's later redesign, spread into
// ALL_CLIENT_CHANGELOG_ENTRIES together (client-changelog-data.ts).
export const EXPLORE_SCOUT_DRONES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794656611441, // Date.now() captured once for this entry.
    introducedIn: "2026.11.14",
    title: "Explore: send your scout drone into the unknown",
    why: "Seeing what lay past your border meant paying manpower to claim tiles that then faded away, or raising a muster flag to march there.",
    changes: [
      "Tapping an unexplored tile now offers Explore instead of Expand To or March To",
      "Explore is free and launches your scout drone from your AFC. It flies toward the tile at Expand To pace, up to 15 tiles past your land, and back",
      "While it flies you see 3 tiles around it, across land and sea. It claims nothing, and you can have one drone out at a time",
      "A rival's border turns it back, even one claimed while it is in the air, and that rival is told foreign scouts were sighted. It can fly over Planetary Defense land, which wakes while it watches",
      "If you have no AFC, unexplored tiles still offer Expand To until a replacement lands",
      "When it lands, a scout report lists the towns, docks, waystations, resources and empires it found, in your feed and the Activity dashboard"
    ]
  },
  {
    createdAt: 1794695503609, // Date.now() captured once for this entry.
    introducedIn: "2026.11.14",
    title: "Scout drone redesign: the Sentinel, and it runs dark",
    why: "The scout drone looked like a rounded courier rather than a reconnaissance craft, and flew lit up even over rival ground.",
    changes: [
      "The scout drone is now the Sentinel: a dark grey panelled sphere with one big glowing camera eye that glances down at the ground, two antennas, and four short arms out to rotor pods with large three-blade rotors",
      "Its rotors spool up on the AFC before it lifts off, it leans forward as it sets out and flares as it comes in to land, and it kicks up a faint ripple from the ground on the way",
      "Over your own and allied land its pod lights and strobe are on. Past your border it runs dark, keeping only a dimmed eye",
      "Both the 3D map and the 2D map show the new look"
    ]
  }
];
