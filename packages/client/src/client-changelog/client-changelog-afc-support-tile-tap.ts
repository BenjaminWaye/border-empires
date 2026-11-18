import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_SUPPORT_TILE_TAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Tapping your AFC's arms opens the AFC",
  why: "Tapping one of the tiles around your AFC showed a bare plains tile with only Abandon Territory, not the AFC sitting on it.",
  changes: [
    "Tapping any support tile around your own AFC now selects the AFC and opens its details and modules",
    "Tiles around the AFC with their own building, and other players' AFCs, still open the tile you tapped"
  ]
};
