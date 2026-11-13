import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_REFINERIES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.12",
  title: "Strategic ore is refined in towns",
  why: "Mines and Umbrite Rigs only added one slot each, so deposits rarely mattered. Refineries make a town and the land around it worth holding.",
  changes: [
    "Mines, Umbrite Rigs and Ore Refineries are removed. A garrisoned Titanium, Umbrite or Gems tile still gives its 1 slot.",
    "New Titanium, Umbrite and Crystal Refineries stand on a town's support ring and process one deposit field each: +2 slots for every garrisoned tile of the field.",
    "A field must be joined to the town by your own land within 10 tiles; water, mountains and other players' land cut the link, and each field feeds only one refinery.",
    "Titanium Smelter, Umbrite Distillery and Crystal Cutter (one per town) raise each processed tile to +3.",
    "The Scarcity Consignment now delivers finished refineries for linked fields of a scarce strategic resource."
  ]
};
