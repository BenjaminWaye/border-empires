import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SHARPER_MINIMAP_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793806740441, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "A sharper minimap",
    why: "The minimap stretched a low-detail picture of the whole world over the land you'd explored, so terrain came out as blobs and territory as faint specks, worst on the phone's full-screen map.",
    changes: [
      "Every tile you know is drawn as its own crisp square, in its terrain colour (once you've explored a lot and the minimap zooms out far, it switches back to the whole-world picture)",
      "Territory is tinted in its owner's colour with a solid outline, so borders between empires show",
      "Towns, watchtowers, waystations, docks and relic hints sit in the middle of their tile and grow when the minimap shows tiles big",
      "On phones the full-screen map renders much sharper, at up to 960 pixels across, and stays sharp when you turn the phone",
      "With fog of war on, the minimap appears straight away after logging in instead of waiting for the world map to build"
    ]
  }
];
