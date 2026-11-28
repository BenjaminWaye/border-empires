import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const F15_PLACEMENT_TOWN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Beacon reach preview, focus lock warning, Explore charges and locked town buildings",
  why: "New players could not see what a Relay Beacon would add before confirming, learned a town's focus locks only after changing it, lost the Explore button once its charges ran out, and saw only two buildings in their town.",
  changes: [
    "Placing a Relay Beacon shows the reach it adds growing out from the beacon, with an outline where it ends, in place of the range square",
    "The placement bar says how many tiles the beacon brings into reach",
    "Confirming a town focus says how long it locks: Confirm Levy · locks 3h 58m, and Lock 3h 58m on the Towns list",
    "The Explore button shows its charges, Explore 3/8, and with none left it stays, greyed, with the time to the next one",
    "The town screen lists buildings still locked by research, greyed, with a link to the research that unlocks them",
    "The Build plots card wraps its text instead of cutting it short"
  ]
};
