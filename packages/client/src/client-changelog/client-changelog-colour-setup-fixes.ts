import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const COLOUR_SETUP_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Picking your first colour just works",
  why: "New players needed up to ten tries to find a colour the game would accept.",
  changes: [
    "Colours the game would refuse are greyed out before you pick them",
    "The suggested colour is always free: tap Use this to take it",
    "Your pick stays put after a refusal",
    "A crowded map still always has a colour for you"
  ]
};
