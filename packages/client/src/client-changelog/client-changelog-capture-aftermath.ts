import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CAPTURE_AFTERMATH_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793636948204, // Date.now() captured once for this entry.
    introducedIn: "2026.11.02",
    title: "Captures leave wreckage",
    why: "A captured Relay Beacon vanished without a trace, and a fort or resource you had just lost could start working for its captor before their troops finished holding it.",
    changes: [
      "A Relay Beacon or siege engine destroyed in a capture lies wrecked where it stood while the capturing troops hold the tile: a beacon's column snapped and down across its plate with its glass shattered, a siege engine overturned with its cannon or lens thrown clear, embers glowing and smoke rising",
      "A captured fort stands breached while the tile is held, one wall smashed through and a tower toppled, and gives no defense. It defends again once the tile is garrisoned",
      "A captured resource tile burns while the tile is held, and its resource slots only count once the hold ends and the tile is garrisoned",
      "Garrisoning a captured tile can't finish before the hold ends, even with faster garrison upgrades",
      "Both the 2D and 3D maps show the wreckage, and the tile menu explains it"
    ]
  },
  {
    createdAt: 1793637500586, // Date.now() captured once for this entry.
    introducedIn: "2026.11.02",
    title: "Battle scars",
    why: "Fought-over ground looked no different from peaceful land.",
    changes: [
      "Capturing a garrisoned tile in battle leaves the ground scarred for 24 hours: blast craters ringed with thrown-up earth, broken pikes and arrows, dropped shields and helmets, burnt timbers",
      "Each further battle on that ground, won or lost, adds more scars and restarts the 24 hours, up to 5 levels; the worst ground is cratered edge to edge with barricades, embers and smoke",
      "Scars stay with the ground whoever owns it, and show on both the 2D and 3D maps",
      "The tile menu shows how scarred the ground is and how long until it fades"
    ]
  }
];
