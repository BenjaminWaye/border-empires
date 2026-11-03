import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_STACKED_INDUSTRY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793689109815, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "AI empires build real economies",
    why: "AI empires never stacked Manufactories or Ancillary Depots, never built Clearing Houses, Neural Works or Reserve Lattices, and put Trade Nexuses where they did nothing.",
    changes: [
      "AI empires now stack Manufactories, Ancillary Depots and Aether Condensers around the same town",
      "They build a Trade Nexus once their towns are connected, then a Clearing House once there are Manufactories for it to boost",
      "They pair Ancillary Depots with a Reserve Lattice and Ancillary Factories with Neural Works",
      "They expand to link towns when the connection would raise their income",
      "Expect richer AI rivals with deeper manpower reserves"
    ]
  }
];
