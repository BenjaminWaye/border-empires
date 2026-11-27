import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ATTACK_EN_ROUTE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Launch Attack says when your attack is already en route",
  why: "Launch Attack stayed lit on a tile you had already attacked, and pressing it again only showed \"Another battle is already being fought for this tile\".",
  changes: [
    "While your troops are marching on or fighting for a tile, its Launch Attack button is greyed out and reads \"Attack En Route\" until the battle ends.",
    "Attack Connected Region and multi-tile attacks skip tiles you are already attacking instead of failing on them."
  ]
};
