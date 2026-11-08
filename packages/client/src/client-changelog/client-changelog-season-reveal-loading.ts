import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SEASON_REVEAL_LOADING_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1794092904287, // Date.now() captured once for this entry.
  introducedIn: "2026.11.08",
  title: "Explore the revealed map after victory",
  why: "Loading a completed season could stall while every distant town and structure was rebuilt.",
  changes: [
    "The whole world remains revealed after a victory, including terrain and territory on the minimap",
    "Detailed town and structure information loads around your camera as you explore"
  ]
}];
