import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TRUCE_LIFETIME_CAP_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793350661948, // Date.now() captured once for this entry.
    introducedIn: "2026.10.30.1",
    title: "Truce extensions have a hard limit",
    why: "A truce could be extended again every day, keeping two empires at peace for weeks.",
    changes: [
      "A truce can last at most 48h in total from when it began, extensions included.",
      "Once a truce reaches that limit, Extend 12h and Extend 24h are disabled until it ends."
    ]
  }
];
