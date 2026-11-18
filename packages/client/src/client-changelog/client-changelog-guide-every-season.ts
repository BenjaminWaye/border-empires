import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_EVERY_SEASON_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Guide: every season, from the first second",
  why: "Playtest: the guide showed up minutes late, older accounts never got it, it covered notifications and the town it pointed at, and it sent the scout drone elsewhere when the towns it knew were across water.",
  changes: [
    "The guide starts for every player at the start of each season. Skip guide ends it for the season.",
    "It appears on step 1 as soon as you're on the map, without waiting for your AFC's landing.",
    "The card moves to the other side of the screen when it would cover the marked tile or a notification.",
    "Guide complete now shows a full progress bar.",
    "A town across water you can't reach overland is no longer marked for Expand To. The guide sends your scout drone out instead."
  ]
};
