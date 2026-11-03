import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_STACKED_INDUSTRY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793689109815, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "AI empires stack their industry",
    why: "AI empires never built a second Manufactory, Ancillary Depot or Aether Condenser at a town, even though players can stack them.",
    changes: [
      "AI empires now build more than one Manufactory, Ancillary Depot or Aether Condenser around the same town when it pays off",
      "Expect richer AI rivals with deeper manpower reserves"
    ]
  }
];
