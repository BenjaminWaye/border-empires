import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LOADING_QUOTE_EVERYWHERE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Lore quotes for the whole load",
  why: "The quote disappeared as soon as loading got slow, just when there was time to read it.",
  changes: [
    "The loading quote now stays up for the whole load, through slow-load hints, warnings and the diagnostics button"
  ]
};
