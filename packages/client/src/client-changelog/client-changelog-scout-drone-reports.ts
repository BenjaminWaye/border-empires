import type { ClientChangelogEntry } from "./client-changelog-data.js";

// First-time player reviews 2026-11-21: the landing report was buried and the drone lost in flight.
export const SCOUT_DRONE_REPORTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Scout drone: see it fly, see what it found",
  why: "New players lost the drone after sending it, and its report landed under the guide and other popups.",
  changes: [
    "When it lands, a card shows how many tiles it explored and what it found, each with an icon and a word; Show takes you there and the find lights up",
    "While it flies, a pill shows the time left; tap it to find the drone, now marked on the map",
    "With every charge unused, an Explore button offers a flight; tap it, then tap the fog",
    "Stops are numbered in flight order; a stop cut short by the range gets an extra outer ring, and a line briefly shows how far you tapped",
    "The bar shows charges left out of the total, e.g. 5/8",
    "The guide and House popups step aside while you plan, fly and read the report",
    "The \"tap here\" marker by your town is gone"
  ]
};
