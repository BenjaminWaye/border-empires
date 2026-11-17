import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RESOURCE_COUNTER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Counter resource trade offers",
  why: "A resource trade offer could only be accepted or declined, so asking for a better price meant declining and rebuilding the whole deal by hand.",
  changes: [
    "Resource trade offers you receive now have a Counter button that loads their terms into the deal, from your side, ready to edit.",
    "Sending the counter replaces their offer with yours. If your counter can't be sent, their offer stays open."
  ]
};
