import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DIPLOMACY_R3_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Offers keep the wording you sent",
  why: "An equal alliance offer turned into \"Fealty demanded\" once the other House shrank, a truce partner showed as Not met yet, and Accept stayed live on an offer already withdrawn.",
  changes: [
    "Alliance offers and alliances keep the fealty wording they were sent with; older ones read Alliance",
    "Empires you have a truce, alliance or offer with count as met, and stay met after it ends",
    "A withdrawn offer leaves the offer bar and Diplomacy at once, with a line in the feed"
  ]
};
