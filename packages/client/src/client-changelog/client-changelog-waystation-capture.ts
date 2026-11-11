import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAYSTATION_CAPTURE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.10",
  title: "Waystations disappear after capture",
  why: "The reward is claimed once.",
  changes: ["A resource reward leaves a resource tile on the former waystation site."]
};
