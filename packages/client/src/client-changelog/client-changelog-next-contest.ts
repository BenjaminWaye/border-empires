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

export const NEXT_CONTEST_STARTING_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "See when the next Sector Contest is starting",
  why: "Once the next contest began starting, the button stayed live, nothing confirmed it, and the brief disconnect while the new world was built looked like the server was down.",
  changes: [
    "As soon as the next Sector Contest starts, committed Houses see Starting the next Sector Contest…, with a note that the new world is being built",
    "Houses that haven't committed yet can still join while it's being built",
    "The brief disconnect while it's built says Building the next Sector Contest instead of Server unreachable",
    "If a start is refused, the reason is shown on the summary screen instead of only in the event feed"
  ]
};
