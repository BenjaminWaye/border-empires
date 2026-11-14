import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_TILE_BAR_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Your AFC leads with upgrades and modules",
  why: "Tapping your AFC showed one big Build button that only held Build AFC, while AFC upgrades and Modules were small links underneath. Build AFC belongs on the land where the new AFC goes, and only helps once your AFC is filling up.",
  changes: [
    "Tapping your AFC now shows AFC upgrades as the main button and Modules beside it.",
    "Build AFC is no longer on the AFC itself. Tap empty garrisoned land and it is in that tile's Build list, once one of your AFCs has 6 modules docked.",
    "Build AFC has an AFC icon in the build list."
  ]
};
