import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GARRISON_BEACON_BUTTONS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793393069266, // Date.now() captured once for this entry.
    introducedIn: "2026.10.30.1",
    title: "Garrison and Relay Beacon stay easy to find",
    why: "Garrison on a town was a small text link, and a Relay Beacon you couldn't afford yet vanished into the Build list.",
    changes: [
      "An ungarrisoned town's screen leads with a gold Garrison button.",
      "A Relay Beacon or Garrison you can't do yet stays the main button, greyed, with the reason on it."
    ]
  }
];
