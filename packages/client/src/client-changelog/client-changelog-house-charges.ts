import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HOUSE_CHARGES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794593857641, // Date.now() captured once for this entry.
    introducedIn: "2026.11.13",
    title: "House Charges: secret objectives for your House",
    why: "Every House now has private goals of its own beside the five victory paths, so there is always something worth fighting for.",
    changes: [
      "Once your AFC lands, your House sends sealed charges: connect two named towns, grow a town into a City, chart a landmass, garrison a named desert or tundra, or wake a Concordance installation.",
      "Your charges are in your own profile: tap your crest, then Manage charges. You are offered three and keep two; you can change which two for a day after they arrive.",
      "A charge only counts if you still hold it when the Sector Contest's winner is crowned. Nobody else can see your charges.",
      "Show on map takes you to a charge and marks it on the map: target towns and relics get guide rings, and a landmass, desert or tundra is outlined in gold, green where you garrison it and hatched where you still need to.",
      "If you lose a charge you were holding, you get a private alert with Show on map, even if it happened while you were away. Nobody else is told.",
      "Until you have explored a charge's target, rings mark the area to search instead. A relic charge only marks an area until you find the installation's beacon."
    ]
  }
];
