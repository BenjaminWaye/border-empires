import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const QUIET_LOGIN_CARDS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Quieter logins",
  why: "Logging back in stacked cards for waystations and town surveys that happened while you were away.",
  changes: [
    "Waystation and town survey cards no longer pop up when you log in. They are in your Chronicles.",
    "Survey clues still show on the matching Manifest card.",
    "Cards still appear for waystations and surveys that happen while you are playing."
  ]
};
