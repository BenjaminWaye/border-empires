import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FORT_WALL_OPENINGS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792861783280, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.1",
    title: "Neighbouring forts join their walls",
    why: "A fort only opened one wall toward a neighbouring fort, so a line or block of forts still showed walls between them.",
    changes: [
      "A fort opens every wall that touches another of your forts, so rows and blocks of forts read as one fortification",
      "Applies to Palisades, Forts and Bastions on both the 3D and 2D maps",
      "Walls stay up next to a fort that is still being built or torn down"
    ]
  }
];
