import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FIRST15_HUD_EXPLAIN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "HUD words explained, FOOD fixes in one tap, an honest landing card",
  why: "New players couldn't tell what Integrity, Dev, AFC or the manpower orb meant, saw what was wrong with FOOD but not what to do, and every contest said difficulty was high.",
  changes: [
    "The first tap on Integrity, Dev, the manpower orb, your charges, Victory race and each tab explains it in one line, with Open beside it",
    "Manpower above capacity reads as a reserve, not over cap",
    "Short of FOOD: the warning offers Garrison grain or Build Farm Plot in one tap",
    "Unfed towns say so on their map label, with the same fix",
    "The landing card rates difficulty low, moderate or high from the contest's day and the largest House"
  ]
};
