import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TRUCE_EMAIL_EMPIRE_FELL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Truce-ending emails and a clear wipe-out notice",
  why: "Truces ended while players were offline and their empires were taken within minutes; the players who were wiped out came back to a new start with no plain explanation.",
  changes: [
    "Both sides of a truce get one email when it has about an hour left, naming the other side and the end time. Extending the truce resets it.",
    "If your empire loses its last territory, your next visit says who took most of it and where your new start is, with Show on map. It shows once.",
    "New Email Notifications toggles: Truce Ending and Empire Fell (both on by default). The Manpower Full toggle now saves."
  ]
};
