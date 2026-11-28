import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OFFER_NOTES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Write your own message on an offer",
  why: "Offers could only carry a few set lines, and trades none, so players couldn't say what they wanted.",
  changes: [
    "Truce, alliance, fealty and trade offers to a ruler take an optional message of up to 140 characters",
    "The set lines are still there as one-tap fills",
    "The other ruler sees it on the offer and in Chronicle"
  ]
};
