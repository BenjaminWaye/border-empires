import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CAPTURE_AFTERMATH_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793636948204, // Date.now() captured once for this entry.
    introducedIn: "2026.11.02",
    title: "Captures leave wreckage",
    why: "A captured Relay Beacon vanished without a trace, and a fort or resource you had just lost could start working for its captor before their troops finished holding it.",
    changes: [
      "A Relay Beacon or Siege Battery destroyed in a capture leaves rubble on the ground while the capturing troops hold the tile",
      "A captured fort shows rubble at its base and gives no defense while the tile is held. It defends again once the tile is garrisoned",
      "A captured resource tile smokes while the tile is held, and its resource slots only count once the hold ends and the tile is garrisoned",
      "Garrisoning a captured tile can't finish before the hold ends, even with faster garrison upgrades",
      "Both the 2D and 3D maps show the rubble and smoke, and the tile menu explains them"
    ]
  },
  {
    createdAt: 1793637500586, // Date.now() captured once for this entry.
    introducedIn: "2026.11.02",
    title: "Battle scars",
    why: "Fought-over ground looked no different from peaceful land.",
    changes: [
      "Capturing a garrisoned tile in battle leaves scorched craters and broken stakes on the ground for 24 hours",
      "Each further battle on that ground, won or lost, adds more scars and restarts the 24 hours, up to 5 levels",
      "Scars stay with the ground whoever owns it, and show on both the 2D and 3D maps",
      "The tile menu shows how scarred the ground is and how long until it fades"
    ]
  }
];
