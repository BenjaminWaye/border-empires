import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_CAPTURE_NO_DROP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Captured AFCs no longer drop from orbit",
  why: "A captured complex was already on the ground.",
  changes: ["Taking an enemy AFC no longer plays the landing animation."]
};
