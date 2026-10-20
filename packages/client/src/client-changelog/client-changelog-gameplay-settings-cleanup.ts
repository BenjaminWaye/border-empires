import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GAMEPLAY_SETTINGS_CLEANUP_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792441146899, // Date.now() captured once for this release.
    introducedIn: "2026.10.19.4",
    title: "Tidier Gameplay settings and Photo Mode for everyone",
    why: "The Gameplay settings page used plain browser checkboxes, a slider and a dropdown that clashed with the rest of the interface, and Photo Mode was only available to admins.",
    changes: [
      "Gameplay settings now use brass toggle switches and a matching music volume slider",
      "Removed the Siege Tower Aim option: siege towers always turn just their aether lens toward the latest battle",
      "Photo Mode is now in Settings > Gameplay for every player. It hides the interface so you can take a clean screenshot of the map",
      "Press Ctrl+P to enter or leave Photo Mode at any time. Esc also leaves it"
    ]
  }
];
