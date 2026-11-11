import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MOBILE_RESOURCE_RIBBON_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.10",
  title: "A slimmer resource ribbon on phones",
  why: "Resource totals and Settings could get cut off on narrow screens.",
  changes: ["A single row shows Coin and color-coded slot availability. Tap a resource for the full breakdown."]
};
