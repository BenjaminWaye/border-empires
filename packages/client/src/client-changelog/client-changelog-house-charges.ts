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
      "When the winner is crowned, every House's charges are unsealed in a new House Charges tab of the season-end screen.",
      "Each charge you hold to the end becomes a collectible card, drawn from the shape you actually held. Your cards show in your profile under Charge Cards; the season winner's are foil.",
      "Fulfilled charges also count in the galaxy: +1 Domain Weight each while you hold a Planet or Outpost, or +3 Influence on that Sector Contest's Stipend.",
      "If you lose a charge you were holding, you get a private alert with Show on map, even if it happened while you were away. Nobody else is told.",
      "Until you have explored a charge's target, rings mark the area to search instead. A relic charge only marks an area until you find the installation's beacon."
    ]
  }
,
  {
    createdAt: 1794807272244, // Date.now() captured once for this entry.
    introducedIn: "2026.11.16",
    title: "House Charges: clearer choices and directions",
    why: "Playtesters could not tell whether their pick was saved, what the diamonds meant, or where a Charter's second town was.",
    changes: [
      "When your charges arrive you get an alert telling you to pick two, with the deadline.",
      "After you save, the Charges panel says which two you are keeping instead of showing the Keep button again.",
      "The diamonds on a charge show its difficulty, and the panel says what a held charge earns.",
      "If one of a Charter's towns is still unscouted, the card gives a rough bearing to it and Show on map keeps the search rings up.",
      "Your career panel shows how your rating compares with the 1,200 starting rating."
    ]
  }
];
