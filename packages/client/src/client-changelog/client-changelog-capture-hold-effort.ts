import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CAPTURE_HOLD_EFFORT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792527745849, // Date.now() captured for this entry.
    introducedIn: "2026.10.20.5",
    title: "Effort counts against freshly captured ground",
    why: "Marching or attacking with Extra or Double effort into a tile whose new owner was still holding it showed better odds but still rolled 50%.",
    changes: [
      "Extra and Double effort now raise your win chance against troops holding captured ground, and Launch Attack offers the effort sheet there",
      "Attacks on held ground cost exactly the manpower committed, win or lose, like attacks on garrisoned tiles"
    ]
  }
];
