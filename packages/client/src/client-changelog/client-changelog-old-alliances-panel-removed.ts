import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OLD_ALLIANCES_PANEL_REMOVED_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Diplomacy is one screen",
  why: "Alliances & supply and the tile Diplomacy action opened an older Alliances panel that repeated what the Diplomacy screen already does.",
  changes: [
    "The old Alliances panel is gone, along with its Alliances & supply and Alliances links",
    "Diplomacy on another empire's land opens your deal with that empire"
  ]
};
