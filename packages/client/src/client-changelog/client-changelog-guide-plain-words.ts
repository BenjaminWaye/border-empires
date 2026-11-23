import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_PLAIN_WORDS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "The guide speaks plainly",
  why: "First-time players got lost on words like frontier and reach.",
  changes: [
    "Guide steps are shorter and say what to tap, in everyday words",
    "Button names in the guide match the buttons on screen"
  ]
};
