import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_FRIENDLY_ROUTE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Troops march through friendly land",
  why: "A muster company walking from its flag to the front took the straight line, even straight through an enemy's territory.",
  changes: [
    "Troops now march round enemy land through your own, allied or unclaimed ground when there's a way round, and are drawn taking that route",
    "A longer way round takes longer to walk; troops only cut through enemy land when nothing else connects"
  ]
};
