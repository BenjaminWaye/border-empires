import type { RecoveredSimulationState } from "./event-recovery/event-recovery.js";

// #1269 renamed the LIGHT_OUTPOST structure kind to RELAY_BEACON as a pure
// find-and-replace across the codebase, breaking with this repo's usual
// "keep the old kind alive as an unbuildable legacy StructureKind" pattern
// (see WEAPONS_WORKSHOP in structure-registry-economic.ts). Snapshots/events
// written before that PR still carry the literal string "LIGHT_OUTPOST" in
// tile.economicStructure.type — a string no downstream switch/lookup
// recognizes anymore, so those tiles silently fell through to wrong
// defaults (client tile menu labeled them "Mintworks", 3D overlay rendered
// nothing).
//
// Self-heals on every boot by rewriting any surviving legacy kind in the
// freshly recovered state, before the runtime starts serving it. Idempotent:
// once every affected tile has been migrated once, this is a no-op forever
// after (the corrected state gets written back to SQLite by the next
// periodic snapshot save, same as the existing SQLite quick_check/REINDEX
// self-heal in sqlite-db.ts).
// Mintworks overlay task renamed the MARKET structure kind to MINTWORKS
// (same visual-asset PR that added the 3D/2D Mintworks overlay), following
// the same pure find-and-replace approach as #1269's LIGHT_OUTPOST rename
// above rather than keeping MARKET alive as an unbuildable legacy kind —
// same self-heal reasoning applies: snapshots/events written before this
// change still carry the literal string "MARKET" in tile.economicStructure.type.
const LEGACY_STRUCTURE_KIND_RENAMES: Readonly<Record<string, string>> = {
  LIGHT_OUTPOST: "RELAY_BEACON",
  MARKET: "MINTWORKS"
};

export const migrateLegacyStructureKinds = (tiles: RecoveredSimulationState["tiles"]): number => {
  let migrated = 0;
  for (const tile of tiles) {
    const currentKind = tile.economicStructure?.type as string | undefined;
    const renamed = currentKind === undefined ? undefined : LEGACY_STRUCTURE_KIND_RENAMES[currentKind];
    if (renamed && tile.economicStructure) {
      tile.economicStructure = { ...tile.economicStructure, type: renamed as typeof tile.economicStructure.type };
      migrated += 1;
    }
  }
  if (migrated > 0) {
    console.log(`[legacy-structure-kind-migration] migrated ${migrated} tile(s) off legacy structure kinds`);
  }
  return migrated;
};
