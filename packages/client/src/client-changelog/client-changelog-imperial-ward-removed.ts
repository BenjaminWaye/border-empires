import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const IMPERIAL_WARD_REMOVED_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Imperial Ward removed",
  why: "The Ward came from the season winner's endorsement, which never took effect.",
  changes: ["The Emperor's Endorsement form and the Imperial Ward button are gone."]
};
