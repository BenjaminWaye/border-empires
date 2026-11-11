import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AETHER_PURGE_RAZES_BEACON_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Aether Purge destroys Relay Beacons",
  why: "A Relay Beacon hit by an Aether Purge kept standing on the neutral tile, and one still being built got stuck half-finished there forever.",
  changes: [
    "An Aether Purge now destroys the Relay Beacon or siege engine on the tile, which leaves its burning wreck for 24 hours, the same as when it's lost in a capture.",
    "Anything still being built on a purged tile is lost, so the site is clear to build on again."
  ]
};
