import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_ATTACK_TRUCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "The guide now teaches attacking and making a truce",
  why: "The Contest chapter ended once you raised a muster flag, and the Diplomacy chapter ended once you opened Diplomacy, so the guide never showed what the flag or the truce offer were for.",
  changes: [
    "After your muster flag, the guide marks enemy tiles next to your land and asks you to Launch Attack",
    "After opening Diplomacy, the guide walks you through offering a 12h truce to a rival House until it is in force",
    "An AI House accepts that first truce for free while you are on this step",
    "When the guide sends your drone somewhere new, it no longer says what is waiting there"
  ]
};
