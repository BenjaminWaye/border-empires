import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_MANUFACTORY_BUILD_LIST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "The guide's Manufactory lives in the Build list",
  why: "During the guide's Manufactory step, a town's bottom bar also showed a Build Manufactory button next to Abandon Territory, so the same building appeared in two places.",
  changes: [
    "Build Manufactory no longer appears in the town screen's bottom bar.",
    "While the guide asks for a Manufactory, the town's Build list opens on its ★ Town Support tab, with the Manufactory first and marked ★ Recommended."
  ]
};
