import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TRUCE_LENGTH_SHOWN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Truce offers show the truce you'd get",
  why: "A truce runs from when it was offered, but Accept never said how long you'd get, accepting gave no confirmation, a countered offer stayed on screen, and Launch Attack looked normal during a truce.",
  changes: [
    "Accept on a truce offer shows the truce you'd get now, e.g. \"Accept 22h truce\"",
    "Accepting a truce shows \"Truce with … · 22h\"",
    "Countering an offer removes it from the offer bar and Diplomacy straight away",
    "During a truce, Launch Attack is no longer the gold button and says \"Breaks truce\""
  ]
};
