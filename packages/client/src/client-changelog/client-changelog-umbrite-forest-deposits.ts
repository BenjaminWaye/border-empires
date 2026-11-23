import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const UMBRITE_FOREST_DEPOSITS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Umbrite deposits now grow through the forest's wood",
  why: "The old Umbrite deposit was a dark rock pile that looked like any other mineral. Umbrite is found in wood, so the 3D map now shows it there.",
  changes: [
    "On the 3D map each Umbrite deposit shows one of three scenes: a whole dead tree turned to violet Umbrite, a bed of split roots with violet cores, or a split stump and its fallen log",
    "On a forest tile, the trees standing where the Umbrite lies make way, so the find sits in a small clearing",
    "The 2D map's Umbrite icon is unchanged"
  ]
};
