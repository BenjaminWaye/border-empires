import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Moved out of client-changelog-data.ts unchanged to keep that file under the line cap.
// createdAt stays where this is listed in client-changelog-data.ts, the only file the changelog gate reads.
export const CLEARER_CAPTURES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.15",
  title: "Clearer captures and truce terms",
  why: "Town captures, rival status and peace offers should be easy to read.",
  changes: [
    "The capture card tells you when you captured a town.",
    "The rival strip shows when you have no pact with a House.",
    "Distant AI Houses charge Coin for truces, even when their manpower runs low.",
    "Envoy Accreditation grants one 10% Coin bonus as long as you have an active truce or mutual alliance.",
    "Incoming truce offers appear in your Chronicle, and town losses to strikes name the attacker.",
    "Truce previews show active lockouts. Muster flag limits and truce lockouts have plain-language error messages. Pending attacks account for flags still being placed.",
    "The Chronicle reports supply interruptions caused by changes at resource sites.",
    "The capture hold timer explains when reach prevents garrisoning.",
    "Attack effort explains the extra manpower and how it affects your odds.",
    "AI diplomacy labels describe how each House negotiates.",
    "Scout reports name deposits you have the technology to identify. Find on map jumps to the nearest known deposit of that resource."
  ]
};
