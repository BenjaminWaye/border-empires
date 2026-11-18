import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OFFER_DOCK_COUNTER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Answer offers you can't pay",
  why: "A playtester accepted a counter-offer she couldn't pay, got a raw error code with the wrong reason, and had no way to counter from the offer itself.",
  changes: [
    "Accept is turned off on an incoming offer when you don't have the Coin or spare supply slots it asks for, and the offer says what is missing.",
    "Incoming offers have a Counter button that opens the deal screen with the offer's terms filled in.",
    "When a deal can't be paid, the message names the House and the resource it is short of, without the raw error code.",
    "You are told when another player accepts your alliance offer."
  ]
};
