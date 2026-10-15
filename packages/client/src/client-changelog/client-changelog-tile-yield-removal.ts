import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TILE_YIELD_REMOVAL_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792042011068, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "Tiles no longer hold collectable yield",
    why: "Income goes straight to your treasury, but tiles still showed leftover stockpiles that could never be collected — and that phantom stockpile quietly covered part of your converter buildings' gold upkeep.",
    changes: [
      "Town markers on the minimap no longer turn gold as if they had something to collect",
      "A settled resource tile's Production line shows the slots it supplies (e.g. Food +2) instead of a per-day amount that no longer exists",
      "Drag-selecting no longer highlights your own tiles",
      "Titanium Works, Umbrite Works and Aether Condenser gold upkeep (including High Yield versions) is now charged in full while you play",
      "After more than 24 hours away, your income still pays that upkeep first, so your treasury only covers any shortfall"
    ]
  },
];
