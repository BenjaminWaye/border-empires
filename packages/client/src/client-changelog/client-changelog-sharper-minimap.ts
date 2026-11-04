import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SHARPER_MINIMAP_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793806740441, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "A sharper minimap",
    why: "The minimap stretched a low-detail picture of the whole world over the land you'd explored, so terrain came out as blobs and territory as faint specks, worst on the phone's full-screen map.",
    changes: [
      "Every tile you know is drawn as its own crisp square, in its terrain colour",
      "Territory is tinted in its owner's colour with a solid outline, so borders between empires show",
      "Towns, watchtowers and waystations sit in the middle of their tile and grow as the map zooms in",
      "On phones the full-screen map renders at your screen's resolution",
      "The minimap appears straight away after logging in instead of waiting for the world map to build"
    ]
  }
];
