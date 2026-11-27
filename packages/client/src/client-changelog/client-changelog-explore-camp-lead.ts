import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const EXPLORE_CAMP_LEAD_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Explore shows your nearest Insurgent camp",
  why: "New players spent every scout drone charge and never found anyone to fight, although an Insurgent camp sits a short way from every landing.",
  changes: [
    "Sending your scout drone also reveals the nearest Insurgent camp you haven't seen yet, so you can attack it or march on it.",
    "The camp stays in sight for 10 minutes, then stays on your map under fog. It shows up in the drone's finds and report."
  ]
};
