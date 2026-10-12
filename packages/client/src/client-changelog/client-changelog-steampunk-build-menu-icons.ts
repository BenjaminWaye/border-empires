import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_STEAMPUNK_BUILD_MENU_ICONS: ClientChangelogEntry[] = [
  {
    createdAt: 1791821187409,
    introducedIn: "2026.10.12.1",
    title: "Building art in the build menu",
    why: "The Buildings tab listed every building with a small text symbol, so it was hard to tell them apart at a glance.",
    changes: [
      "Each building in the Buildings tab now shows a thumbnail of the building as it looks on the map",
      "The Military, Resource, Town Support, Infrastructure and Monuments categories have new steampunk icons",
      "Aegis Dome and Titanium Levy components no longer show a broken image on their info cards"
    ]
  }
];
