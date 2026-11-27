import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HONEST_JOIN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Joining a running contest: an honest warning, and no landing in a rival's land",
  why: "New Houses were sent straight into a running contest with no warning, and on a crowded map they could land inside another empire's reach.",
  changes: [
    "Before you land, the join card shows the contest day, the extra manpower you land with and that difficulty is high",
    "Choose Land now, or wait for the next contest",
    "If the map has no free landing site, joining is closed and your place in the next Sector Contest is reserved, even if that contest fills up",
    "The join card lists the Sector Contests running now; a full one is greyed out, and when none has room you can fund a new sector",
    "A House knocked out on a full map waits for a free landing site instead of landing inside a rival's land"
  ]
};
