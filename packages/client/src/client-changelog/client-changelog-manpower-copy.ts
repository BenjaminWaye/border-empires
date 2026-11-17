import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MANPOWER_COPY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Manpower: spend it",
  why: "New players finished the guide holding thousands of manpower, were told it \"refills every 4 hours\" and left thinking there was nothing to do until coin came in.",
  changes: [
    "The guide's last step tells you to spend your manpower when you're at or over the cap, instead of telling you to come back.",
    "How manpower works: manpower pays for every claim, garrison, build and attack, not only attacks.",
    "Over the cap now reads \"Over cap · spend to refill\"."
  ]
};
