import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FRONTIER_MATERIALS_CUT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.12",
  title: "Resin, conductive minerals and catalyst removed",
  why: "The three materials only added a manpower bonus you rarely noticed and crowded the map. Territory development is moving to refineries in towns instead.",
  changes: [
    "Neural resin, conductive minerals and catalyst deposits no longer appear, and the Resin Extractor, Implant Foundry and Catalyst Refinery are gone, along with their manpower bonus.",
    "They can no longer be traded; luxury biota is still tradable alongside FOOD, Titanium, Crystal and Umbrite.",
    "The Neural Resin Processing Warrant is removed. Reserve Custody Cadre still unlocks the Ancillary Depot, and the Frontier Export Charter still unlocks the Cultivation Estate."
  ]
};
