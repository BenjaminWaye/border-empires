import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_RENDERER_SWITCH: ClientChangelogEntry[] = [
  {
    createdAt: 1790768452229,
    introducedIn: "2026.09.30.6",
    title: "Tells you when you're on the 2D map, and how to get back to 3D",
    why: "Some players landed on the 2D map without being told, and had no way to find the 3D map again short of editing the page address.",
    changes: [
      "A notice now says \"You're playing on the 2D map\" when you join on 2D, with a Switch to 3D map button",
      "New Map Renderer setting under Settings → Gameplay shows which map you're on and switches between 2D and 3D",
      "If 3D can't start on your device, the notice and the setting now both tell you where to try it again"
    ]
  }
];
