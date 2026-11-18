import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ENCIRCLEMENT_POCKET_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Cutting off enemy frontier now wins it",
  why: "Capturing a tile that cut an enemy's frontier off from its garrisoned land turned the cut-off part neutral, leaving an empty pocket you had to claim again tile by tile.",
  changes: [
    "When your attack cuts enemy frontier off from its supply, the cut-off frontier becomes your frontier instead of neutral. The same applies the other way if a failed attack loses the tile it was launched from.",
    "Towns in the cut-off pocket still turn neutral, and land cut off by Aether Lance, bombardment, Create Mountain or a lost dock also still turns neutral."
  ]
};
