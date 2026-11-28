import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Player report 2026-11-28 (phone): on the right edge the guide's ? sat on the Victory Race card.
export const GUIDE_CLEARS_VICTORY_RACE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "The guide no longer sits on the Victory Race card",
  why: "On phones the guide moves to the right edge when the left would cover what a step points at, but there it started level with the Victory Race card and its ? covered the card's corner.",
  changes: [
    "On the right edge the guide card and its ? sit just below the Victory Race card"
  ]
};
