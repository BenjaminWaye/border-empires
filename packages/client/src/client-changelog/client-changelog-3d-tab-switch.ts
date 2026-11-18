import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const THREE_D_TAB_SWITCH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "3D Map Survives Switching Apps",
  why: "Switching to another app on a phone could drop the game to the 2D map for the rest of the session.",
  changes: [
    "When your browser reclaims the 3D map while the game is in the background, the 3D map is rebuilt as soon as you come back."
  ]
};
