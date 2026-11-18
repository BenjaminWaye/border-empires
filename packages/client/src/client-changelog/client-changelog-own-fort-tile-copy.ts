import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OWN_FORT_TILE_COPY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Clearer tile panel on your own land",
  why: "Your own garrisoned resource tile still said it required a garrison, and your own fort listed the muster an attacker needs under Upkeep, as if it were a cost to you.",
  changes: [
    "Resource tiles drop the Requires: Garrison card once your garrisoned tile meets it.",
    "The fort capture muster now shows only on forts you don't own, under its own Defense heading."
  ]
};
