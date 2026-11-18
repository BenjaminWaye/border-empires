import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RETURNING_LOGIN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Returning to the game is faster",
  why: "Every login rebuilt the whole world's terrain, hills and rivers from scratch, freezing the screen for several seconds, longest on phones.",
  changes: [
    "Your device now keeps the current world's terrain, so logging in again shows the map several seconds sooner. On a phone-speed device the map took about 16 seconds to appear after your empire arrived and now takes about 6.",
    "The first login of a season, or after a game update, still builds the world once.",
    "The map also does a little less work on every frame."
  ]
};
