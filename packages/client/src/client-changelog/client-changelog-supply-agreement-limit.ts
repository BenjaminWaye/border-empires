import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SUPPLY_AGREEMENT_LIMIT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "See your supply agreement limit before a deal fails",
  why: "Accepting a trade could fail with \"too many active resource agreements\", with no warning beforehand and no word on whose limit was full.",
  changes: [
    "The trade screen and Alliances panel show how many supply agreements you have, out of 16, and highlight it when you're nearly or completely full.",
    "At 16/16, Accept and Send are disabled for deals that add resource supply, and say why. End one of your agreements to make room.",
    "Offers to or from a House that is already full are refused when they are made, naming that House. AI Houses no longer offer deals to anyone who is full, or while they are full themselves."
  ]
};
