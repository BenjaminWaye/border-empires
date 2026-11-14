import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FOG_CLOUD_BLOCKS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Smooth clouds over unexplored land on phones",
  why: "On some phones the 3D map's unexplored fog broke into blocky rectangles with clouds shifted across their edges. Removing the tile grid made it obvious.",
  changes: ["The fog's cloud pattern now uses exact integer maths on the GPU, so it stays smooth on every device."]
};
