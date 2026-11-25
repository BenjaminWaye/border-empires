import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BEACON_TOWARD_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Beacons toward far land, Explore stays off panels",
  why: "Land outside your reach had no beacon you could build toward it, a greyed button gave no reason on a phone, and the Explore button sat over open panels.",
  changes: [
    "Land outside your reach offers Relay Beacon toward here: it opens beacon placement on frontier inside your reach, nearest that tile",
    "Greyed small buttons show why, under the name",
    "The guide only marks food the server counts as in your reach",
    "The Explore button and drone report wait while a screen, panel or sheet is open"
  ]
};
