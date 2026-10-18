import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_DISABLED_AETHER_TOWER: ClientChangelogEntry[] = [
  {
    createdAt: 1792318198312,
    introducedIn: "2026.10.18.2",
    title: "Disabled Aether Towers go dark",
    why: "A switched-off Aether Tower looked exactly like a working one, so you couldn't tell at a glance which towers were running.",
    changes: [
      "A disabled Aether Tower stops animating: its rings, cogs and motes hold still",
      "Its glowing core, beads and spire tip dim, and it no longer links into the aether network with nearby towers",
      "On the 2D map a disabled Aether Tower is drawn faded with its lens darkened"
    ]
  }
];
