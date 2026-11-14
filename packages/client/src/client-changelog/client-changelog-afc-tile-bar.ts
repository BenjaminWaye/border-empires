import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_TILE_BAR_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Your AFC leads with upgrades and modules",
  why: "Tapping your AFC showed one big Build button that only held Build AFC, while AFC upgrades and Modules were small links underneath. A new AFC only helps once the one you have is filling up.",
  changes: [
    "Tapping your AFC now shows AFC upgrades as the main button and Modules beside it.",
    "Build AFC is offered once that AFC has 6 modules docked, and now has an AFC icon in the build list."
  ]
};
