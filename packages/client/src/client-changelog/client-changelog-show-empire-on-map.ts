import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SHOW_EMPIRE_ON_MAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Show an empire on the map",
  why: "Finding an empire from Diplomacy or Ranks meant scrolling the map by hand.",
  changes: [
    "An empire's profile has a Show on map button that moves the camera to the nearest of its tiles you have seen, in view or remembered under fog.",
    "Empires you have never seen show Not discovered yet instead."
  ]
};
