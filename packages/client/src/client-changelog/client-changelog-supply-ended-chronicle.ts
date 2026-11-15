import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SUPPLY_ENDED_CHRONICLE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Chronicle tells you when a supply deal ends",
  why: "A resource supply from another House could stop with no word anywhere, leaving a town unfed until you noticed the numbers had changed.",
  changes: [
    "Chronicle → Yours lists every supply deal that ends, for both Houses: what stopped flowing, and whether it was cancelled (and by whom), ended by an attack, or ran out.",
    "Losing an import you did not end yourself is marked as a loss."
  ]
};
