import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_NAMEPLATES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793166986713, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.1",
    title: "Town nameplates",
    why: "Town status was spread across floating badges and an underfed toast, and towns had no names on the map.",
    changes: [
      "Every town shows a nameplate at every zoom, edged in its owner's colour. Your towns also show population.",
      "Your towns' plates show a status icon: unfed (food struck through), upgrade ready, nearby war or recently captured.",
      "The gold coin town marker is gone; the nameplate marks towns now.",
      "The underfed toast is gone. Unfed towns off screen still get an edge marker."
    ]
  }
];
