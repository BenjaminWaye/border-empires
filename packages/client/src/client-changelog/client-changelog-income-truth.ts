import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INCOME_TRUTH_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794695792594, // Date.now() captured once for this entry.
    introducedIn: "2026.11.14",
    title: "Coin numbers agree everywhere",
    why: "Screens showed different coin per day for the same empire and towns, and the Empire Integrity bonus was in the total but on no line.",
    changes: [
      "The Empire Integrity income bonus or penalty is listed as its own line under Coin",
      "Coin lines in the Economy panel always add up to the total",
      "Towns list, town screen and tile panel show the same coin per day for a town",
      "Food lists slots your upgrades waive, so its lines add up to the total",
      "Manifests show what the next one will cost after you commission"
    ]
  }
];
