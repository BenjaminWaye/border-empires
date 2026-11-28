import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HOUSE_IDENTITY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Every House has a name and crest",
  why: "AI empires had bare first names, guests were \"House Noname\", new players were offered one colour, and Credits did not name the creator.",
  changes: [
    "AI empires are Houses with their own crest, like House Brassmoor",
    "Play now guests get a House name and a crest",
    "Only Houses in the current contest hold a colour, so new players get a full choice of colours",
    "Credits: created by Benjamin Waye, made by Waypoint Studios"
  ]
};
