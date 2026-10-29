import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LANDING_RESERVE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793274421549, // Date.now() captured once for this entry.
    introducedIn: "2026.10.29.1",
    title: "Bigger landing reserve, and catch-up for late arrivals",
    why: "New empires ran out of manpower early in their first session, and players who joined mid-season started far behind.",
    changes: [
      "Every new empire now lands with +2,000 bonus manpower, up from +1,000.",
      "Joining after the season has started adds the manpower your capital would have produced since the start (about 576 per day), so joining on day 5 adds about 2,880 more.",
      "Like before, this bonus can go above your manpower cap. Regeneration pauses until you spend back under the cap."
    ]
  }
];
