import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ABANDON_CONFIRM_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Abandon Territory asks first",
  why: "Abandon Territory gave a tile, or a whole town, away on one tap. A slip on the town screen could lose a town without a word.",
  changes: [
    "Abandon Territory now asks before giving anything up, and names the town when you are about to lose one."
  ]
};
