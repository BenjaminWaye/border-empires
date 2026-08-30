// Extracted from client-types.ts (file-line-cap task: that file is already
// over the 500-line cap and may not grow) -- self-contained type with only
// two importers, so it has no dependency overlap worth keeping inline.
export type TileUpkeepEntry = {
  label: string;
  perMinute: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "GOLD", number>>;
  // Slot-based upkeep (e.g. Observatory's progressively-costlier CRYSTAL slot
  // occupation) has no per-minute drain to report -- this carries the actual
  // resource-slot count instead, so the tile overview can show "N CRYSTAL
  // slot(s)" the same way Fort/Siege Outpost/economic structures do.
  slot?: { resource: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE"; count: number };
};
