import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_SCOUT_BUTTON_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Send your scout drone from the AFC",
  why: "The only way to send a scout drone was to find and tap an unexplored tile first.",
  changes: [
    "Your AFC's tile menu now has a Send scout drone button. Press it, then tap any tile beyond your land to send the drone that way",
    "The drone still leaves from your AFC nearest the tile you pick. Cancel or Escape stops picking"
  ]
};
