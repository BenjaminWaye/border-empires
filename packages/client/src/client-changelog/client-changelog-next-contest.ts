import type { ClientChangelogEntry } from "./client-changelog-data.js";

// createdAt is set where this is listed in client-changelog-data.ts.
export const NEXT_CONTEST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.10",
  title: "Join the next Sector Contest when one ends",
  why: "Two votes reset the world for everyone, guests could cast them, and the button counted to 5 while 2 votes started the reset.",
  changes: [
    "When a Sector Contest ends, Join the next Sector Contest replaces the vote, and the button shows how many Houses have committed",
    "The next contest starts once 10 Houses have committed, and they all start together, whether online or not",
    "You can keep looking around the finished world until then",
    "Guests are asked to save their empire before joining; a guest who is online when it starts goes straight in",
    "If you arrive after the crown was claimed, you see a short result card instead of the full summary",
    "The committed count is kept when you reload"
  ]
};
