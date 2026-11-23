import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Player report 2026-11-23: a 24h truce offered in the evening and accepted at 8am the next day ran until
// 8am the day after, so the sender was locked out of attacking 16h longer than they had offered.
export const TRUCE_CLOCK_FROM_OFFER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Truces count from the offer",
  why: "A truce's hours only started counting when it was accepted, so accepting an old offer late gave a full truce the sender never meant to give.",
  changes: [
    "A new truce now runs from when it was offered: accepting a 24h offer 16h later gives 8h of truce",
    "An unanswered truce offer lapses when its hours run out; the countdown on it is the truce time left",
    "Coin per hour promised with a truce is paid only for the hours that are left",
    "Extending a running truce still adds its hours to the current end"
  ]
};
