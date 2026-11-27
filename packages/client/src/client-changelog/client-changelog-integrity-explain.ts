import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INTEGRITY_EXPLAIN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Integrity drops explain themselves",
  why: "Integrity fell from 100% to 89% with no word on why, a starving town gave no reason, and the food numbers and header disagreed.",
  changes: [
    "When Integrity drops a few points, a notice says why (a hole, a thin line, ungarrisoned land) and how to fix it; Fix shows the weak tiles and holes on the map",
    "The Integrity panel's Why it fell card points at the spot and can start Garrison Many",
    "Holes in your land are now outlined on the map with the weak tiles",
    "An unfed town says how much food it needs and to build a Farm Plot or garrison grain or fish",
    "The top bar's food chip now says free, and Economy says used, so the two numbers read the same way",
    "After loading, the food and Integrity chips wait for fresh numbers instead of showing old ones"
  ]
};
