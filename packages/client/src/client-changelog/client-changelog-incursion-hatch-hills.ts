import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INCURSION_HATCH_HILLS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792704196027, // Date.now() captured once for this entry.
    introducedIn: "2026.10.22.2",
    title: "Reach hatching drapes over hills",
    why: "On the 3D map, the striped hatch on land held inside another empire's reach was a flat sheet, so the bumps of any hill under it broke through the stripes.",
    changes: [
      "3D map: the hatch and its edge strips now follow the hill's surface, so the whole hatched tile stays visible",
      "The 2D map is unchanged, since it draws hills flat"
    ]
  }
];
