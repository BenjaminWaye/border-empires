import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MUSTER_DOCK_TRANSPORT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Companies sail from the docks",
  why: "A company marching from a muster flag to a front across water walked straight over the sea.",
  changes: [
    "A company marching to a front across water now marches to a dock, crosses in a troop transport, comes ashore and marches on.",
    "The sea crossing adds to the march time: boarding and landing take at least 4 seconds, then about 0.75 seconds per tile sailed (30 seconds at most).",
    "3D map: the transport steams along the sea lane with the company aboard. 2D map: the march line follows the same route, with a boat marking the crossing."
  ]
};
