import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OUT_OF_REACH_NO_DECAY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792266607210, // frozen Date.now() value for this release
    introducedIn: "2026.10.17.1",
    title: "Land beyond your reach no longer decays",
    why: "Land claimed outside your reach vanished on a hidden 5-minute timer, and when the oldest tile went, every tile chained behind it went with it, with no warning.",
    changes: [
      "Frontier outside your reach stays yours; there is no decay timer any more",
      "You still can't garrison it, and if its chain of frontier back to your settled land is cut anywhere, everything past the cut is lost at once",
      "Its tile menu now says Beyond your reach and explains this, instead of a countdown"
    ]
  }
];
