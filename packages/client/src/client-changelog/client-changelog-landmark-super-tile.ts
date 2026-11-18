import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LANDMARK_SUPER_TILE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "AFCs and relics are one tile",
  why: "An AFC or relic covers 9 tiles, but only its centre changed hands.",
  changes: [
    "All 9 tiles of an AFC or relic share one owner and show your colour.",
    "Attacking, claiming or garrisoning any of the 9 tiles acts on the whole site."
  ]
};
