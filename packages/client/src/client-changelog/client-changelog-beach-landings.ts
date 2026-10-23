import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BEACH_LANDINGS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792759228659, // Date.now() captured once for this entry.
    introducedIn: "2026.10.23.2",
    title: "Land on the beaches beside a linked dock",
    why: "A sea crossing could only land on the far dock itself, so a harbour was defended by watching one tile.",
    changes: [
      "A crossing from your dock can now land on any coastal tile right next to the dock it links to, not just the dock",
      "Select a dock to see its landing ground highlighted at both ends of its sea routes; the tile panel also names the docks whose crossings can land on a tile",
      "A beach landing is supplied through the dock you sailed from: lose that dock and the landing is cut off at once",
      "Supply lines draw the sea leg back to your home dock, with a ring on the dock the landing depends on",
      "Muster flags on Advance or March use beach landings too"
    ]
  }
];
