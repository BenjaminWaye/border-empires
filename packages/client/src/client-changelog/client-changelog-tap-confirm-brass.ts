import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TAP_CONFIRM_BRASS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "The on-map confirm button now matches the game's look",
  why: "The prompt that pops up over a tapped tile (\"Expand To\") was a bright green bubble in a generic font, unlike every other panel and button.",
  changes: [
    "The floating confirm button is now a brass plate with the same title lettering and cost font as the action button in the tile sheet"
  ]
};
