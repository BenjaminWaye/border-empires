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
//
// Manifest/Coin rework removed SEED_GRANARY entirely (not renamed to
// something else -- deleted, per the design brief's "cannot be built,
// loaded, rendered, or referenced"). Any tile still carrying that kind from
// before this change reverts to its base GRANARY on the next boot; the
// growth-multiplier math in server-game-constants.ts already treats a plain
// Granary and a former Seed Granary identically now that the buffed-radius
// bonus is gone, so this is a lossless downgrade, not a partial migration.
const LEGACY_STRUCTURE_KIND_RENAMES: Readonly<Record<string, string>> = {
  LIGHT_OUTPOST: "RELAY_BEACON",
  MARKET: "MINTWORKS",
  SEED_GRANARY: "GRANARY"
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

type RecoveredTile = RecoveredSimulationState["tiles"][number];

export type LegacyPalisadeMigrationResult = {
  moved: number;
  // A fort under construction on the tile is a Palisade->Fort upgrade in
  // flight: the Palisade becomes its upgradingFrom, so it keeps defending
  // until the Fort completes, exactly as before.
  mergedIntoUpgrade: number;
  // Any other fort already on the tile supersedes the Palisade.
  droppedUnderFort: number;
  // Fort-family structures have no "inactive" state (dormancy comes from
  // resource slots instead), so a manually-deactivated Palisade comes back active.
  reactivated: number;
};

const palisadeFortFromLegacy = (
  legacy: NonNullable<RecoveredTile["economicStructure"]>
): NonNullable<RecoveredTile["fort"]> => ({
  ownerId: legacy.ownerId,
  variant: "WOODEN_FORT",
  status: legacy.status === "inactive" ? "active" : legacy.status,
  ...(legacy.status === "removing" ? { previousStatus: "active" as const } : {}),
  ...(legacy.completesAt !== undefined ? { completesAt: legacy.completesAt } : {}),
  ...(legacy.activatedAt !== undefined ? { activatedAt: legacy.activatedAt } : {}),
  ...(legacy.disabledUntil !== undefined ? { disabledUntil: legacy.disabledUntil } : {})
});

// Palisades (WOODEN_FORT) used to be stored in tile.economicStructure, the
// same single slot as Relay Beacons / Harbor Exchanges, so building one on a
// beacon tile deleted the beacon. They're fort-ladder tier 0 in tile.fort now
// (docs/structure-slot-unification-plan.md, PR 1). Runs on the fully recovered
// state (after event replay), same self-heal contract as above.
export const migrateLegacyPalisades = (tiles: RecoveredSimulationState["tiles"]): LegacyPalisadeMigrationResult => {
  const result: LegacyPalisadeMigrationResult = { moved: 0, mergedIntoUpgrade: 0, droppedUnderFort: 0, reactivated: 0 };
  for (const tile of tiles) {
    const legacy = tile.economicStructure;
    if (legacy?.type !== "WOODEN_FORT") continue;
    const palisadeStanding = legacy.status === "active" || legacy.status === "inactive";
    if (tile.fort?.status === "under_construction" && tile.fort.ownerId === legacy.ownerId && palisadeStanding && !tile.fort.upgradingFrom) {
      tile.fort = { ...tile.fort, upgradingFrom: "WOODEN_FORT" };
      result.mergedIntoUpgrade += 1;
    } else if (tile.fort) {
      result.droppedUnderFort += 1;
    } else {
      if (legacy.status === "inactive") result.reactivated += 1;
      tile.fort = palisadeFortFromLegacy(legacy);
      result.moved += 1;
    }
    delete tile.economicStructure;
  }
  if (result.moved + result.mergedIntoUpgrade + result.droppedUnderFort > 0) {
    console.log(
      `[legacy-structure-kind-migration] palisades moved=${result.moved} mergedIntoUpgrade=${result.mergedIntoUpgrade} droppedUnderFort=${result.droppedUnderFort} reactivated=${result.reactivated}`
    );
  }
  return result;
};
