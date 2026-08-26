import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import type { SlotResource } from "@border-empires/shared";

type StrategicResourceKey = DomainStrategicResourceKey;
type TownPopulationTier = NonNullable<NonNullable<DomainTileState["town"]>["populationTier"]>;

type EconomyTileLike = {
  ownerId?: string | undefined;
  ownershipState?: DomainTileState["ownershipState"] | string | undefined;
  resource?: DomainTileState["resource"] | string | undefined;
  dockId?: string | undefined;
  town?: DomainTileState["town"] | undefined;
  townType?: string | undefined;
  townName?: string | undefined;
  townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" | undefined;
};

export type PendingSettlementRecord = {
  ownerId: string;
  tileKey: string;
  startedAt: number;
  resolvesAt: number;
  goldCost: number;
  commandId: string;
};

/** Server-durable dev-queue entry -- see runtime-dev-queue.ts. Mirrors the
 *  shared DevQueueEntry shape but is tracked per-player here. Snapshotted
 *  (current-value, like strategicResources) into initialState.players[]
 *  and reseeded on boot -- see event-recovery-player-state.ts and
 *  createPlayerRuntimeSummaryFromRecovered -- so it survives a cold
 *  process restart. */
export type ServerDevQueueEntry = {
  tileKey: string;
  x: number;
  y: number;
  kind: "SETTLE" | "BUILD";
  /** Only present for kind === "BUILD" -- e.g. "FORT", "MINTWORKS", "REMOVE_STRUCTURE". */
  structureType?: string;
  queuedAt: number;
  /** § queued-buildings-mp-reimbursement: manpower reserved from the player at enqueue time for a BUILD entry (never set for SETTLE/REMOVE_STRUCTURE), refunded on cancel or before the entry drains -- see runtime-dev-queue-build-reservation.ts. */
  reservedManpower?: number;
  /** The resource-slot requirement reserved alongside reservedManpower, netted into later enqueue checks so a player can't queue more slot-gated BUILDs than they have supply for. */
  reservedSlotRequirements?: { resource: SlotResource; count: number }[];
};

/** Server-durable waypoint/expand-queue entry -- see runtime-waypoint-queue.ts. */
export type ServerWaypointQueueEntry = {
  target: { x: number; y: number };
  trackBarbarian?: boolean;
  queuedAt: number;
};

/**
 * Server-durable "claim continuation" -- see runtime-claim-continuation-
 * command-handlers.ts. Registered when a player clicks a composite
 * settle(+build) action on a tile that is either mid-EXPAND or already
 * owned-but-unsettled. Means: once the tile is owned+FRONTIER by this player
 * (whether already true, or once an in-flight EXPAND lands it), auto-SETTLE
 * it, then auto-BUILD `structureType` (if set) once settled -- all driven
 * from the server-durable devQueue, so it survives the player disconnecting.
 * Bounded at DEV_QUEUE_SERVER_CAP entries (same cap as devQueue itself,
 * reused rather than introducing a second magic number -- see
 * docs/agents/state-and-persistence-discipline.md).
 */
export type ClaimContinuation = {
  structureType?: string;
};

export type PlayerRuntimeSummary = {
  territoryTileKeys: Set<string>;
  frontierTileKeys: Set<string>;
  hotFrontierTileKeys: Set<string>;
  strategicFrontierTileKeys: Set<string>;
  buildCandidateTileKeys: Set<string>;
  settledTileCount: number;
  townCount: number;
  ownedTownTierByTile: Map<string, TownPopulationTier>;
  goldIncomePerMinute: number;
  strategicProductionPerMinute: Record<StrategicResourceKey, number>;
  activeDevelopmentProcessCount: number;
  pendingSettlementsByTile: Map<string, PendingSettlementRecord>;
  fishFoodPerMinute: number;
  lastActiveAtMs: number;
  devQueue: ServerDevQueueEntry[];
  waypointQueue: ServerWaypointQueueEntry[];
  claimContinuations: Map<string, ClaimContinuation>;
};

const emptyStrategicProduction = (): Record<StrategicResourceKey, number> => ({
  FOOD: 0,
  TITANIUM: 0,
  CRYSTAL: 0,
  UMBRITE: 0,
  SHARD: 0
});

// TITANIUM/CRYSTAL/UMBRITE are slot-based, not produced (docs/manpower-economy-
// rewrite-plan.md §5.1/§5.6) — only FARM/FISH still feed FOOD here.
// §5 (resource slots, docs/manpower-economy-rewrite-plan.md): FOOD joined
// TITANIUM/CRYSTAL/UMBRITE as slot-based, not produced — there's only one food
// mechanic now (§5.4 dormancy on FOOD slot shortfall, replacing the old
// stockpile/coverage flow). FARM/FISH still grant FOOD *slot supply*
// (BASE_SLOTS_BY_TILE_RESOURCE, structure-slots.ts) — a separate mechanism,
// untouched by this.
const strategicProductionPerMinuteForResource = (_resource: DomainTileState["resource"] | string | undefined): number => 0;

const strategicResourceForTile = (resource: DomainTileState["resource"] | string | undefined): StrategicResourceKey | undefined => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return "FOOD";
    default:
      return undefined;
  }
};

const townGoldPerMinute = (
  populationTier: NonNullable<NonNullable<DomainTileState["town"]>["populationTier"]> | undefined
): number => {
  if (populationTier === "SETTLEMENT" || populationTier === undefined) return 1;
  if (populationTier === "CITY") return 3;
  if (populationTier === "GREAT_CITY") return 5;
  if (populationTier === "METROPOLIS") return 6.4;
  return 2;
};

const townPopulationTierForTile = (tile: EconomyTileLike): NonNullable<NonNullable<DomainTileState["town"]>["populationTier"]> | undefined =>
  tile.town?.populationTier ?? tile.townPopulationTier;

const hasTownOnTile = (tile: EconomyTileLike): boolean => Boolean(tile.town || tile.townType);

const goldIncomePerMinuteForTile = (tile: EconomyTileLike): number => {
  if (tile.ownershipState !== "SETTLED") return 0;
  if (hasTownOnTile(tile)) return townGoldPerMinute(townPopulationTierForTile(tile));
  if (tile.dockId) return 0.5;
  return 0;
};

const activeStructureProcessCount = (tile: DomainTileState, ownerId: string): number => {
  let count = 0;
  if (tile.fort?.ownerId === ownerId && (tile.fort.status === "under_construction" || tile.fort.status === "removing")) count += 1;
  if (
    tile.observatory?.ownerId === ownerId &&
    (tile.observatory.status === "under_construction" || tile.observatory.status === "removing")
  ) {
    count += 1;
  }
  if (
    tile.siegeOutpost?.ownerId === ownerId &&
    (tile.siegeOutpost.status === "under_construction" || tile.siegeOutpost.status === "removing")
  ) {
    count += 1;
  }
  if (
    tile.economicStructure?.ownerId === ownerId &&
    (tile.economicStructure.status === "under_construction" || tile.economicStructure.status === "removing")
  ) {
    count += 1;
  }
  return count;
};

export const createEmptyPlayerRuntimeSummary = (): PlayerRuntimeSummary => ({
  territoryTileKeys: new Set<string>(),
  frontierTileKeys: new Set<string>(),
  hotFrontierTileKeys: new Set<string>(),
  strategicFrontierTileKeys: new Set<string>(),
  buildCandidateTileKeys: new Set<string>(),
  settledTileCount: 0,
  townCount: 0,
  ownedTownTierByTile: new Map<string, TownPopulationTier>(),
  goldIncomePerMinute: 0,
  strategicProductionPerMinute: emptyStrategicProduction(),
  activeDevelopmentProcessCount: 0,
  pendingSettlementsByTile: new Map<string, PendingSettlementRecord>(),
  fishFoodPerMinute: 0,
  lastActiveAtMs: 0,
  devQueue: [],
  waypointQueue: [],
  claimContinuations: new Map<string, ClaimContinuation>()
});

/**
 * Boot-time constructor for a recovered player's summary. `waypointQueue`/
 * `devQueue` are current-value snapshot fields (see event-recovery-player-
 * state.ts) -- this is the read side that seeds them back into the live
 * PlayerRuntimeSummary so DEV_QUEUE_* / WAYPOINT_* commands survive a cold
 * process restart instead of resetting to `[]`. Accepts a structural type
 * (rather than importing RecoveredPlayerState) to avoid a circular import
 * with event-recovery-player-state.ts, which imports the queue entry types
 * from this module.
 */
export const createPlayerRuntimeSummaryFromRecovered = (
  recovered: { waypointQueue?: ServerWaypointQueueEntry[]; devQueue?: ServerDevQueueEntry[] } | undefined
): PlayerRuntimeSummary => ({
  ...createEmptyPlayerRuntimeSummary(),
  ...(recovered?.waypointQueue?.length
    ? { waypointQueue: recovered.waypointQueue.map((entry) => ({ ...entry, target: { ...entry.target } })) }
    : {}),
  ...(recovered?.devQueue?.length ? { devQueue: recovered.devQueue.map((entry) => ({ ...entry })) } : {})
});

export const cloneStrategicProduction = (
  value: Record<StrategicResourceKey, number>
): Record<StrategicResourceKey, number> => ({
  FOOD: value.FOOD,
  TITANIUM: value.TITANIUM,
  CRYSTAL: value.CRYSTAL,
  UMBRITE: value.UMBRITE,
  SHARD: value.SHARD
});

export const estimateIncomePerMinuteFromTiles = (playerId: string, tiles: Iterable<EconomyTileLike>): number => {
  let income = 0;
  for (const tile of tiles) {
    if (tile.ownerId !== playerId) continue;
    income += goldIncomePerMinuteForTile(tile);
  }
  return Math.round(income * 100) / 100;
};

export const estimateStrategicProductionPerMinuteFromTiles = (
  playerId: string,
  tiles: Iterable<Pick<EconomyTileLike, "ownerId" | "ownershipState" | "resource">>
): Record<StrategicResourceKey, number> => {
  const production = emptyStrategicProduction();
  for (const tile of tiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    const resourceKey = strategicResourceForTile(tile.resource);
    if (!resourceKey) continue;
    production[resourceKey] += strategicProductionPerMinuteForResource(tile.resource);
  }
  return production;
};

export const applyTileToPlayerSummary = (
  summary: PlayerRuntimeSummary,
  tileKey: string,
  tile: DomainTileState
): void => {
  if (!tile.ownerId) return;
  summary.territoryTileKeys.add(tileKey);
  if (tile.ownershipState === "FRONTIER") summary.frontierTileKeys.add(tileKey);
  if (tile.ownershipState === "SETTLED") {
    summary.settledTileCount += 1;
    const resourceKey = strategicResourceForTile(tile.resource);
    if (resourceKey) summary.strategicProductionPerMinute[resourceKey] += strategicProductionPerMinuteForResource(tile.resource);
    // Track fish food separately — fish tiles fill the food cap but don't extend it
    if (tile.resource === "FISH") {
      summary.fishFoodPerMinute += 72 / 1440;
    }
  }
  if (tile.ownershipState === "SETTLED" && hasTownOnTile(tile)) {
    summary.townCount += 1;
    const tier = townPopulationTierForTile(tile) ?? "SETTLEMENT";
    summary.ownedTownTierByTile.set(tileKey, tier);
  }
  summary.goldIncomePerMinute += goldIncomePerMinuteForTile(tile);
  summary.activeDevelopmentProcessCount += activeStructureProcessCount(tile, tile.ownerId);
};

export const removeTileFromPlayerSummary = (
  summary: PlayerRuntimeSummary,
  tileKey: string,
  tile: DomainTileState
): void => {
  if (!tile.ownerId) return;
  summary.territoryTileKeys.delete(tileKey);
  summary.frontierTileKeys.delete(tileKey);
  if (tile.ownershipState === "SETTLED") {
    summary.settledTileCount = Math.max(0, summary.settledTileCount - 1);
    const resourceKey = strategicResourceForTile(tile.resource);
    if (resourceKey) {
      summary.strategicProductionPerMinute[resourceKey] = Math.max(
        0,
        summary.strategicProductionPerMinute[resourceKey] - strategicProductionPerMinuteForResource(tile.resource)
      );
    }
    if (tile.resource === "FISH") {
      summary.fishFoodPerMinute = Math.max(0, summary.fishFoodPerMinute - 72 / 1440);
    }
  }
  if (tile.ownershipState === "SETTLED" && hasTownOnTile(tile)) {
    summary.townCount = Math.max(0, summary.townCount - 1);
    summary.ownedTownTierByTile.delete(tileKey);
  }
  summary.goldIncomePerMinute = Math.max(0, summary.goldIncomePerMinute - goldIncomePerMinuteForTile(tile));
  summary.activeDevelopmentProcessCount = Math.max(0, summary.activeDevelopmentProcessCount - activeStructureProcessCount(tile, tile.ownerId));
};

export const addPendingSettlementToSummary = (
  summary: PlayerRuntimeSummary,
  settlement: PendingSettlementRecord
): void => {
  summary.pendingSettlementsByTile.set(settlement.tileKey, settlement);
  summary.activeDevelopmentProcessCount += 1;
};

export const removePendingSettlementFromSummary = (
  summary: PlayerRuntimeSummary,
  tileKey: string
): void => {
  if (!summary.pendingSettlementsByTile.has(tileKey)) return;
  summary.pendingSettlementsByTile.delete(tileKey);
  summary.activeDevelopmentProcessCount = Math.max(0, summary.activeDevelopmentProcessCount - 1);
};
