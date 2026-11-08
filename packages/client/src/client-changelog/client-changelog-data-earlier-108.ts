import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_108: ClientChangelogEntry[] = [
  {
    createdAt: 1792832339274, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.1",
    title: "Forced Ancillarification",
    why: "A flat population sacrifice becomes trivial in large towns. The cost should grow with the population at stake.",
    changes: ["Active Ancillary Factories can convert residents from their supported town into 100 immediate manpower, even above the cap. The menu shows exactly how many people will be taken.", "Each town can be forced once every four hours and must retain at least 10,000 residents. The factory menu shows the exact population cost."]
  },
  {
    createdAt: 1792854395082, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.relics",
    title: "Concordance relic installations",
    why: "Relics are surviving planetary machinery, with useful installations and finite reserves worth fighting over.",
    changes: ["New planets select seven installation families, represented by weathered ziggurats with House banners. Nearby anonymous light columns and minimap markers guide exploration.", "Garrison relics to use their installations. Combat suits, defensive field cells, ancillary bodies and nanofabrication material have persistent finite reserves; recapture never refills them.", "Capture artwork explains the buried installation and its benefit. Depleted sites remain on the map with an empty-reserve marker. Existing campaigns retain their original wonder rules."]
  }
];
