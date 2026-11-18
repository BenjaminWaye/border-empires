import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_SUPPORT_TILE_TAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Tap an AFC arm to see its module",
  why: "Tapping one of the tiles around your AFC showed a bare plains tile with only Abandon Territory, not the AFC or the module on that arm.",
  changes: [
    "Tapping any arm tile around your own AFC now opens the AFC's Modules view",
    "The module docked on that arm is shown at the top with what it does, and its socket is highlighted. An empty arm says so",
    "Modules no longer say House · movable. A module you captured says which House it was captured from; your own modules have no label. On another House's AFC, a module taken from you says Captured from your House",
    "Tiles around the AFC with their own building or a muster flag, and other players' AFCs, still open the tile you tapped"
  ]
};
