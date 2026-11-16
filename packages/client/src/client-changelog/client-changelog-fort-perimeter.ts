import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FORT_PERIMETER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Fort perimeters",
  why: "A fort only protected its own tile, so defending a stretch of border meant a fort on every tile.",
  changes: [
    "Palisades and Forts now also defend your garrisoned tiles next to them with a third of their defense bonus (a Fort's neighbours defend at 1.5x)",
    "Titanium and Thunder Bastions cover two tiles out with a quarter of their bonus",
    "Perimeters don't stack: a tile uses the strongest one, or its own fort if that is stronger",
    "When a fort finishes, frontier tiles inside its perimeter are queued for garrisoning at the normal cost",
    "A low stone wall marks the edge of each protected area, and the attack odds show a Fort perimeter row"
  ]
};
