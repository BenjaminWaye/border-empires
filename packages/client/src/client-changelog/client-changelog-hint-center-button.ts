import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_HINT_CENTER_BUTTON: ClientChangelogEntry[] = [
  {
    createdAt: 1791749160889, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.11.1",
    title: "Jump to what a hint is about",
    why: "Hint boxes describe a town, dock, resource or enemy somewhere on the map, but gave no way to find it.",
    changes: [
      "Hint boxes now have a Center button that moves the camera to the tile the hint is about and selects it",
      "The same Center button appears on the hint's entry in the Activity feed, so you can still jump to it after dismissing the box"
    ]
  }
];
