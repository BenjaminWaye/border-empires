import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const KEEP_CHARGES_DISABLED_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Keep button greys out until your hand is ready",
  why: "A player pressed \"Keep these 2\" with only one card kept and nothing happened, because the button looked ready when it was not.",
  changes: [
    "In House Charges, \"Keep these 2\" is greyed out until exactly two cards are kept; the note above it says how many more to tap"
  ]
};
