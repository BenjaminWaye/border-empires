import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWNS_LIST_COIN_PENDING_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Towns list no longer shows 0 coin/day for towns still loading",
  why: "A fed town could read 0.0 coin/day in the Towns list until you opened it, while its own screen showed what it earns.",
  changes: [
    "A town whose coin figure hasn't arrived yet shows … in the Towns list, which now fetches it on its own."
  ]
};
