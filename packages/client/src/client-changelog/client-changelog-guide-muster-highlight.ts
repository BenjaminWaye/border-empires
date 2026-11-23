import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Player report 2026-11-21: the guide's muster step said a border tile was marked, but none was.
export const GUIDE_MUSTER_HIGHLIGHT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "The guide marks where to raise your first muster flag",
  why: "When Planetary Defense or a rival was only seen across neutral land, the guide's muster step marked no tile, and the Stage Muster buttons weren't pointed out.",
  changes: [
    "The guide marks your border tiles nearest Planetary Defense or a rival",
    "Stage Muster is outlined once you pick a tile, and so is the confirm button"
  ]
};
