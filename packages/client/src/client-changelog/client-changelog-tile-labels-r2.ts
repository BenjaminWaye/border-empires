import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TILE_LABELS_R2_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Clearer tile labels, beacon costs and pop-ups",
  why: "Playtesters met fogged land labelled Unclaimed that another House held, a beacon tip pointing at a greyed-out button, a beacon quote that didn't match the first charge, and pop-ups hidden under other panels.",
  changes: [
    "Fogged neutral land reads \"Last seen unclaimed\": someone may have taken it since",
    "The \"Beyond your reach\" tip names the \"Relay Beacon toward here\" button",
    "Relay Beacon placement shows what Confirm spends now, e.g. \"70 m.p. (20 now)\"; the rest is charged as each step starts",
    "Garrison Many shades your region charges' land and counts the selected tiles in it",
    "The guide card steps aside while an error or alert is showing",
    "The \"3D is running slow\" prompt now sits above the HUD"
  ]
};
