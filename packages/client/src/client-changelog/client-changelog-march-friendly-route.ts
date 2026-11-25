import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_FRIENDLY_ROUTE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Troops march through friendly land",
  why: "A muster company walking from its flag to the front took the straight line, even straight through an enemy's territory.",
  changes: [
    "Troops now march round enemy land through your own, allied or neutral ground when the way round is short, and are drawn taking that route",
    "A way round takes a little longer to walk; when it would be much longer, troops cut through enemy land as before"
  ]
};
