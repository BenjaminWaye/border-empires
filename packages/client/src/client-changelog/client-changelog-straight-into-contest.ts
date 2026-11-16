import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const STRAIGHT_INTO_CONTEST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Opening the game takes you straight into the Sector Contest",
  why: "Signed-in players had to find a join button on a Choose your Sector screen that hid the map, under Discord and invite links.",
  changes: [
    "When a Sector Contest is running, you join it as soon as the game opens, the same way Play now already worked for guests.",
    "Discord is in Settings and Last Contest Recap is on the leaderboard. If the Sector is full, you are offered the next Sector's waitlist as before."
  ]
};
