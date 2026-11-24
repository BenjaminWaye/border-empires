import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CREDITS_PAGE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Credits",
  why: "There was nowhere to see who makes the game.",
  changes: ["Settings has a Credits page: Border Empires is made by Wayepoint Studios"]
};

export const PHONE_NEXT_STEP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Next › goes straight to your next step",
  why: "On a phone, Next › on the folded tracker only opened the tracker, so the step itself was another tap away.",
  changes: ["Tapping Next › takes you to the top next step (or the first food fix while you are short), the same as tapping its tracker row"]
};
