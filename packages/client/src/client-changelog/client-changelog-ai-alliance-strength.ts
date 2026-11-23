import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_ALLIANCE_STRENGTH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Great powers don't ally with minor Houses",
  why: "A small House could buy alliances with the strongest AI empires for a few coin.",
  changes: [
    "An AI three or more times your strength won't ally with you",
    "An AI clearly stronger than you can't be paid into an alliance: it has to like you first",
    "Alliance offers say what an alliance binds you to"
  ]
};
