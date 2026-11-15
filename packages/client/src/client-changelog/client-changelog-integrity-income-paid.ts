import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INTEGRITY_INCOME_PAID_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794695920586, // Date.now() captured once for this entry.
    introducedIn: "2026.11.14",
    title: "Integrity income bonus always paid",
    why: "After a server restart or a busy moment, coin could pile up at the rate without your Empire Integrity bonus, even though the Integrity panel showed it.",
    changes: ["Your Empire Integrity income bonus (or penalty) now always applies to the coin you earn"]
  }
];
