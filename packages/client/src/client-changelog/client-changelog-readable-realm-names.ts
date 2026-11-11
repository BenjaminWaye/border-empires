import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const READABLE_REALM_NAMES_ENTRY: ClientChangelogEntry = {
  createdAt: 1794410558462, // Date.now() captured once for this entry.
  introducedIn: "2026.11.11",
  title: "Empire names are easier to read",
  why: "Zoomed out, an empire's name could sit under its territory colour and was hard to make out.",
  changes: ["Empire names on the map now draw on top of territory colours, including remembered land in fog, with solid ink and a stronger outline"]
};
