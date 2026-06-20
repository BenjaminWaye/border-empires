import type { EconomicStructureType, FortVariant, SiegeOutpostVariant, Tile, TileUpkeepEntry } from "../types.js";

// ── Kind discriminator ────────────────────────────────────────────

export type StructureKind = "FORT" | "OBSERVATORY" | "OUTPOST" | "ECONOMIC";

// ── Placement check types ─────────────────────────────────────────

export interface PlacementContext {
  /** The target tile (mutable snapshot — may be replaced by the handler's
   *  town-support resolution). */
  tile: Pick<
    Tile,
    "x" | "y" | "terrain" | "ownerId" | "ownershipState" | "resource" | "dockId" | "town"
  > & {
    fort?: unknown;
    observatory?: unknown;
    siegeOutpost?: unknown;
    economicStructure?: unknown;
  };
  /** The building player. */
  actor: {
    techIds: Set<string>;
    playerId: string;
  };
  /** True when the handler is upgrading an existing structure of the same family
   *  (e.g. FORT → IRON_BASTION). Placement checks that would reject because a
   *  structure already exists should return null when this is true. */
  isUpgrade: boolean;
  /** Tile field that the new structure will write to. */
  tileField: "fort" | "observatory" | "siegeOutpost" | "economicStructure";
  /** Per-spec context passed through from the registry entry. */
  extra?: Record<string, unknown>;
}

/**
 * Placement validator. Returns `null` when placement is valid, or a reason
 * string when it should be rejected.
 */
export type PlacementCheck = (ctx: PlacementContext) => string | null;

// ── Completion context (for future phases) ────────────────────────

export interface CompletionContext {
  tileKey: string;
  structureType: string;
  ownerId: string;
}

export interface RemovalContext {
  tileKey: string;
  structureType: string;
  ownerId: string;
}

// ── Structure spec ────────────────────────────────────────────────

export interface StructureSpec {
  /** Wire-level identifier. Unique across the registry. */
  type: string;
  /** Family this structure belongs to. Drives which tile field it writes and
   *  which completion hook fires. */
  kind: StructureKind;
  /** Variant within the family (e.g. SIEGE_OUTPOST/SIEGE_TOWER for OUTPOST).
   *  Undefined for kinds with no variants. */
  variant?: string;
  /** Per-build resource cost. */
  cost: {
    gold: number;
    manpower: number;
    strategic?: Partial<
      Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>
    >;
  };
  /** Build duration in milliseconds (pre-tech-mults). */
  buildMs: number;
  /** Tech prerequisites (all must be present). */
  techIds: ReadonlyArray<string>;
  /** Other structures that must exist on the tile (e.g. ADVANCED_IRONWORKS
   *  requires IRONWORKS). */
  prerequisiteStructureTypes?: ReadonlyArray<string>;
  /** Whether this structure consumes a development slot on its tile. */
  consumesDevelopmentSlot: boolean;
  /** Placement validators. Each returns null if placement is OK or a reason
   *  string otherwise. Composable so families share generic checks. */
  placement: ReadonlyArray<PlacementCheck>;
  /** Upkeep per minute. Each entry models one resource cost (food, iron,
   *  crystal, supply, gold, oil). Empty array for no upkeep.
   *
   *  Populated in Phase 1 for the 21 structures with active upkeep in the
   *  live sim (per `structureUpkeepPerMinute` in player-update-economy.ts).
   *  Empty entries are correct for structures with no active upkeep. */
  upkeep: ReadonlyArray<TileUpkeepEntry>;
  /** Tile field this structure populates. Phase 2 collapses to a single field;
   *  Phase 1 keeps this as the routing key. */
  tileField: "fort" | "observatory" | "siegeOutpost" | "economicStructure";
}

// ── Placement predicates ──────────────────────────────────────────

/** Reject unless the actor owns the tile. */
export const ownerOwnsTile: PlacementCheck = (ctx) => {
  if (ctx.tile.ownerId !== ctx.actor.playerId) return "tile not owned by player";
  return null;
};

/** Reject unless the tile ownership state is SETTLED. */
export const tileIsSettled: PlacementCheck = (ctx) => {
  if (ctx.tile.ownershipState !== "SETTLED") return "tile must be settled";
  return null;
};

/** Reject unless the tile is LAND. */
export const tileIsLand: PlacementCheck = (ctx) => {
  if (ctx.tile.terrain !== "LAND") return "requires land tile";
  return null;
};

/**
 * Reject if the target tile field already has a structure that isn't being
 * upgraded. Accounts for the upgrade path: the handler may upgrade from a
 * wooden fort, light outpost, or lower-tier variant.
 *
 * In Phase 1 this is a composite check that mirrors the per-handler logic.
 * In Phase 2 the generic handler will call this with per-kind diff.
 */
export const noConflictingStructure: PlacementCheck = (ctx) => {
  if (ctx.isUpgrade) return null;

  const conflicting: string[] = [];
  if (ctx.tileField !== "fort" && ctx.tile.fort) conflicting.push("fort");
  if (ctx.tileField !== "observatory" && ctx.tile.observatory) conflicting.push("observatory");
  if (ctx.tileField !== "siegeOutpost" && ctx.tile.siegeOutpost) conflicting.push("siege outpost");
  if (ctx.tileField !== "economicStructure" && ctx.tile.economicStructure) conflicting.push("structure");
  if (conflicting.length > 0) return `tile already has ${conflicting.join(", ")}`;
  return null;
};

/**
 * Reject if the tile's structureShowsOnTile check fails. This predicate
 * delegates to the existing `structureShowsOnTile` function.
 *
 * In Phase 1 consumers are expected to wrap this with the specific type name.
 * In Phase 2 the generic handler will substitute the registry type directly.
 */
export const structureShowsOnTileCheck =
  (
    structureType: string,
    showsFn: (
      type: string,
      ctx: {
        ownershipState: string | undefined;
        resource: string | undefined;
        dockId: string | undefined;
        townPopulationTier: string | undefined;
        supportedTownCount: number;
        supportedDockCount: number;
      },
    ) => boolean,
  ): PlacementCheck =>
  (ctx) => {
    const ok = showsFn(structureType, {
      ownershipState: ctx.tile.ownershipState,
      resource: ctx.tile.resource,
      dockId: ctx.tile.dockId,
      townPopulationTier: ctx.tile.town?.populationTier,
      supportedTownCount: (ctx.extra?.supportedTownCount as number) ?? 0,
      supportedDockCount: (ctx.extra?.supportedDockCount as number) ?? 0,
    });
    if (!ok) return `${structureType} cannot be built on this tile`;
    return null;
  };

/** Reject if the tile has a structure of the same type already. */
export const noDuplicateStructureType: PlacementCheck = (ctx) => {
  const type = (ctx.extra?.structureType as string) ?? "";
  // Only meaningful for economic-structure tiles where same-type dupes
  // are blocked by the handler.
  if (ctx.tileField !== "economicStructure") return null;
  const es = ctx.tile.economicStructure as { type?: string } | undefined;
  if (es?.type === type) return `${type} already exists on this tile`;
  return null;
};
