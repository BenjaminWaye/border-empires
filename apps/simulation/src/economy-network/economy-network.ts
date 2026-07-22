import {
  DOCK_INCOME_PER_MIN,
  townFoodUpkeepPerMinute,
  type DomainPlayer,
  type DomainStrategicResourceKey,
  type DomainTileState
} from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import { additiveEffectForPlayer, multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";

export type EconomyPlayer = Pick<DomainPlayer, "id" | "techIds" | "domainIds" | "mods">;

export type ConnectedTownNetworkEntry = {
  connectedTownCount: number;
  connectedTownBonus: number;
  // Subset of directly-connected towns that have an active Clearing House —
  // precomputed once per connectivity group (see buildConnectedTownNetworkForPlayer),
  // not by having every consumer re-scan a full connectedTownKeys list. Bounded
  // by the actual number of Clearing Houses nearby, not by connectedTownCount.
  connectedClearingHouseKeys?: string[];
  connectedTownNames?: string[];
};

// Moved from player-update-economy.ts so buildConnectedTownNetworkForPlayer can
// precompute per-group Clearing House membership without a circular import
// (player-update-economy.ts already imports from this module). Re-exported
// there for existing call sites/tests.
const supportTileBelongsToTown = (
  playerId: string,
  supportTile: DomainTileState,
  townTile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): boolean => {
  let assignedTown: DomainTileState | undefined;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const candidate = tiles.get(`${supportTile.x + dx},${supportTile.y + dy}`);
      if (!candidate?.town || candidate.ownerId !== playerId || candidate.ownershipState !== "SETTLED") continue;
      if (candidate.town.populationTier === "SETTLEMENT") continue;
      if (!assignedTown || candidate.x < assignedTown.x || (candidate.x === assignedTown.x && candidate.y < assignedTown.y)) {
        assignedTown = candidate;
      }
    }
  }
  return assignedTown?.x === townTile.x && assignedTown.y === townTile.y;
};

export const hasSupportedStructure = (
  playerId: string,
  tile: DomainTileState,
  structureType: string,
  tiles: ReadonlyMap<string, DomainTileState>
): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tiles.get(`${tile.x + dx},${tile.y + dy}`);
      if (!neighbor || neighbor.ownerId !== playerId || neighbor.ownershipState !== "SETTLED") continue;
      if (!supportTileBelongsToTown(playerId, neighbor, tile, tiles)) continue;
      if (neighbor.economicStructure?.ownerId === playerId && neighbor.economicStructure.status === "active" && neighbor.economicStructure.type === structureType) return true;
    }
  }
  return false;
};

export { supportTileBelongsToTown };

type TownConnectivityGroup = {
  // Sorted, shared across every town touching this component/group — building
  // it once per group (not once per pair) is what keeps this O(component
  // size) instead of O(towns_in_component²).
  members: string[];
  clearingHouseKeys: string[];
};

export type DockEconomyContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
};

export type ConnectedTownNetworkOptions = {
  maxConnectedTownNames?: number;
};

const keyFor = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;

const connectedTownStepCount = (connectedTownCount: number): number => Math.max(0, Math.min(3, connectedTownCount));

export const connectedTownBonusForPlayer = (
  connectedTownCount: number,
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => {
  const stepCount = connectedTownStepCount(connectedTownCount);
  if (stepCount <= 0) return 0;
  const stepBonusAdd = additiveEffectForPlayer(player, "connectedTownStepBonusAdd");
  return [0.5, 0.4, 0.3]
    .slice(0, stepCount)
    .reduce((total, baseStep) => total + baseStep + stepBonusAdd, 0);
};

export const buildConnectedTownNetworkForPlayer = (
  player: EconomyPlayer,
  tiles: ReadonlyMap<string, DomainTileState>,
  playerSettledTiles: Iterable<DomainTileState> = tiles.values(),
  options: ConnectedTownNetworkOptions = {}
): Map<string, ConnectedTownNetworkEntry> => {
  const maxConnectedTownNames = Math.max(0, options.maxConnectedTownNames ?? Number.POSITIVE_INFINITY);

  // Partition settled land into (TOWN-tier-or-higher) town tiles and
  // everything else — non-town settled tiles AND settlement-tier towns are
  // both "corridor" tiles here. SETTLEMENT-tier towns never use
  // connectedTownBonus themselves (player-update-economy.ts's isSettlement
  // early-return skips straight past it to a flat rate), so they stop being
  // barrier/endpoint nodes and stop counting toward any OTHER town's
  // connectedTownCount either — confirmed as the intended semantics (not a
  // performance-only assumption) before making this change. Town tiles act
  // as both barriers and connection endpoints; non-town tiles (now including
  // settlements) form the land corridors connecting real towns.
  const ownedTownKeys = new Set<string>();
  const nonTownSettledKeys = new Set<string>();
  for (const tile of playerSettledTiles) {
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    const k = keyFor(tile.x, tile.y);
    if (tile.town && tile.town.populationTier !== "SETTLEMENT") {
      ownedTownKeys.add(k);
    } else {
      nonTownSettledKeys.add(k);
    }
  }

  // With 0 or 1 TOWN-tier-or-higher towns, connectedTownCount is mathematically
  // guaranteed to be 0 for all of them (there's nobody else to connect to) —
  // skip the corridor BFS + grouping entirely rather than pay for a result we
  // already know. This was the dominant cost in the live-captured
  // event_loop_blocked incidents (2026-07-22): town_network_rebuild /
  // tile_yield_economy_context_rebuild stacking across many players on every
  // login/subscribe. The partition pass above is still O(settled tiles) —
  // unavoidable without incremental maintenance — but it's far cheaper than
  // the BFS + group-construction work this skips.
  if (ownedTownKeys.size <= 1) {
    const out = new Map<string, ConnectedTownNetworkEntry>();
    for (const townKey of ownedTownKeys) {
      out.set(townKey, { connectedTownCount: 0, connectedTownBonus: connectedTownBonusForPlayer(0, player) });
    }
    return out;
  }

  const hasClearingHouseAt = (townKey: string): boolean => {
    const tile = tiles.get(townKey);
    return tile ? hasSupportedStructure(player.id, tile, "CLEARING_HOUSE", tiles) : false;
  };

  // Step 1: direct town-to-town adjacency (8-neighbors that are both towns).
  // These are connected regardless of the corridor graph. O(towns) — each
  // town has at most 8 neighbors, so this step alone can never be quadratic.
  const directNeighborsByTown = new Map<string, Set<string>>();
  for (const townKey of ownedTownKeys) {
    directNeighborsByTown.set(townKey, new Set());
  }
  for (const townKey of ownedTownKeys) {
    const [rawX, rawY] = townKey.split(",");
    const cx = Number(rawX), cy = Number(rawY);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextKey = keyFor(cx + dx, cy + dy);
        if (ownedTownKeys.has(nextKey)) {
          directNeighborsByTown.get(townKey)?.add(nextKey);
        }
      }
    }
  }

  // Step 2: single BFS pass over connected components of non-town settled
  // tiles (unchanged — O(N) total). Every town 8-adjacent to any tile in a
  // component is directly connected to every other such town through that
  // corridor. The previous implementation materialized this as O(K^2)
  // explicit pairs per component (a real 3+ second event-loop block was
  // traced to this on a large contiguous empire — see runtime.ts comment at
  // the tileYieldEconomyContextForPlayer call site). Instead, every town
  // touching a component gets a REFERENCE to one shared group descriptor
  // (built once, O(component's town count)), and each group's Clearing House
  // membership is precomputed once per group rather than re-scanned by every
  // downstream consumer for every connected town (which was a second,
  // separate O(K^2) cost layered on top, in player-update-economy.ts /
  // live-town-summary.ts).
  const visited = new Set<string>();
  const queue: string[] = [];
  const groupsByTown = new Map<string, TownConnectivityGroup[]>();

  for (const startKey of nonTownSettledKeys) {
    if (visited.has(startKey)) continue;

    visited.add(startKey);
    queue.length = 0;
    queue.push(startKey);
    let readIndex = 0;
    const adjacentTownKeys = new Set<string>();

    while (readIndex < queue.length) {
      const current = queue[readIndex++]!;
      const [rawX, rawY] = current.split(",");
      const cx = Number(rawX), cy = Number(rawY);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextKey = keyFor(cx + dx, cy + dy);
          if (ownedTownKeys.has(nextKey)) {
            adjacentTownKeys.add(nextKey);
            continue;
          }
          if (!nonTownSettledKeys.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          queue.push(nextKey);
        }
      }
    }

    if (adjacentTownKeys.size === 0) continue;
    const members = [...adjacentTownKeys].sort((l, r) => l.localeCompare(r));
    const group: TownConnectivityGroup = {
      members,
      clearingHouseKeys: members.filter(hasClearingHouseAt)
    };
    for (const townKey of members) {
      let list = groupsByTown.get(townKey);
      if (!list) {
        list = [];
        groupsByTown.set(townKey, list);
      }
      list.push(group);
    }
  }

  // Build output entries. Fast path (no direct-adjacency towns, exactly one
  // corridor group) is O(1) per town — this is the common shape for one
  // large contiguous empire, and is exactly what previously cost O(K) per
  // town (O(K^2) total across the empire). The union path below only runs
  // for towns with genuinely more complex local connectivity (a direct
  // 8-adjacent neighbor town, and/or bridging more than one corridor group —
  // see the "does not count a town as connected when only reachable through
  // another town" test), bounded by that specific town's own connections.
  const out = new Map<string, ConnectedTownNetworkEntry>();
  for (const townKey of ownedTownKeys) {
    const direct = directNeighborsByTown.get(townKey) ?? new Set<string>();
    const groups = groupsByTown.get(townKey);

    let connectedTownCount: number;
    let clearingHouseKeys: string[];
    let memberKeysForNames: string[] | undefined;

    if (direct.size === 0 && groups && groups.length === 1) {
      const group = groups[0]!;
      connectedTownCount = group.members.length - 1;
      clearingHouseKeys = group.clearingHouseKeys.includes(townKey)
        ? group.clearingHouseKeys.filter((k) => k !== townKey)
        : group.clearingHouseKeys;
      memberKeysForNames =
        connectedTownCount > 0 && connectedTownCount <= maxConnectedTownNames
          ? group.members.filter((k) => k !== townKey)
          : undefined;
    } else if (direct.size === 0 && (!groups || groups.length === 0)) {
      connectedTownCount = 0;
      clearingHouseKeys = [];
      memberKeysForNames = undefined;
    } else {
      const unionSet = new Set<string>(direct);
      for (const group of groups ?? []) {
        for (const member of group.members) {
          if (member !== townKey) unionSet.add(member);
        }
      }
      connectedTownCount = unionSet.size;
      const clearingHouseSet = new Set<string>();
      for (const key of direct) if (hasClearingHouseAt(key)) clearingHouseSet.add(key);
      for (const group of groups ?? []) {
        for (const key of group.clearingHouseKeys) if (key !== townKey) clearingHouseSet.add(key);
      }
      clearingHouseKeys = [...clearingHouseSet];
      memberKeysForNames =
        connectedTownCount > 0 && connectedTownCount <= maxConnectedTownNames
          ? [...unionSet].sort((l, r) => l.localeCompare(r))
          : undefined;
    }

    const connectedTownNames = memberKeysForNames
      ? memberKeysForNames
          .map((k) => tiles.get(k)?.town?.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0)
          .sort((l, r) => l.localeCompare(r))
      : [];

    out.set(townKey, {
      connectedTownCount,
      connectedTownBonus: connectedTownBonusForPlayer(connectedTownCount, player),
      ...(clearingHouseKeys.length ? { connectedClearingHouseKeys: clearingHouseKeys } : {}),
      ...(connectedTownNames.length ? { connectedTownNames } : {})
    });
  }
  return out;
};

export const enrichTownWithConnectedNetwork = (
  tile: DomainTileState,
  townNetwork: ReadonlyMap<string, ConnectedTownNetworkEntry> | undefined
): DomainTileState["town"] | undefined => {
  if (!tile.town) return undefined;
  // SETTLEMENT-tier towns never get an entry in townNetwork (see
  // buildConnectedTownNetworkForPlayer — they're corridor tiles, not graph
  // nodes, since their connectedTownBonus is never read). Zero these fields
  // explicitly rather than falling through to "return tile.town unchanged":
  // a town that was TOWN-tier-or-higher with a real connectedTownCount and
  // gets downgraded to SETTLEMENT (e.g. capture-aftermath tier reset) must
  // not keep displaying its stale pre-downgrade value forever.
  if (tile.town.populationTier === "SETTLEMENT") {
    if (tile.town.connectedTownCount === 0 && tile.town.connectedTownBonus === 0 && !tile.town.connectedTownNames) {
      return tile.town;
    }
    const { connectedTownNames: _drop, ...rest } = tile.town;
    return { ...rest, connectedTownCount: 0, connectedTownBonus: 0 };
  }
  const entry = townNetwork?.get(keyFor(tile.x, tile.y));
  if (!entry) return tile.town;
  return {
    ...tile.town,
    connectedTownCount: entry.connectedTownCount,
    connectedTownBonus: entry.connectedTownBonus,
    ...(entry.connectedTownNames ? { connectedTownNames: entry.connectedTownNames } : {})
  };
};

export const dockGoldOutputMultiplierForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => multiplicativeEffectForPlayer(player, "dockGoldOutputMult");

/**
 * Returns the keys of the player's first three settled town tiles in the
 * iteration order of the supplied iterable — the same semantics as the old
 * implementation that scanned all tiles, but O(3) instead of O(all_map_tiles).
 *
 * Callers should pass `summary.ownedTownTierByTile.keys()` (or equivalent)
 * rather than `tiles.values()`, avoiding the full tile-map scan.
 */
export const firstThreeTownKeysForPlayer = (
  _playerId: string,
  ownedSettledTownTileKeys: Iterable<string>
): Set<string> => {
  const result = new Set<string>();
  for (const key of ownedSettledTownTileKeys) {
    result.add(key);
    if (result.size >= 3) break;
  }
  return result;
};

export const firstThreeTownsGoldOutputMultiplierForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => multiplicativeEffectForPlayer(player, "firstThreeTownsGoldOutputMult");

export const firstThreeTownsPopulationGrowthMultiplierForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => multiplicativeEffectForPlayer(player, "firstThreeTownsPopulationGrowthMult");

export const dockConnectionBonusPerLinkForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => {
  const configured = additiveEffectForPlayer(player, "dockConnectionBonusPerLink");
  return configured > 0 ? configured : 0.5;
};

export const dockConnectedOwnedSettledCount = (
  dockTileKey: string,
  playerId: string,
  context: DockEconomyContext
): number => {
  let connectedCount = 0;
  for (const linkedDockTileKey of context.dockLinksByDockTileKey.get(dockTileKey) ?? []) {
    const linked = context.tiles.get(linkedDockTileKey);
    if (linked?.ownerId === playerId && linked.ownershipState === "SETTLED") connectedCount += 1;
  }
  return connectedCount;
};

/**
 * Additive gold/min granted per connected owned dock when a dock is
 * "supported" by an adjacent (8-neighbor) owned, active CUSTOMS_HOUSE
 * (Harbor Exchange). This was previously all-cost/no-benefit in the
 * rewrite — CUSTOMS_HOUSE_GOLD_UPKEEP was charged with no matching income.
 * See docs/plans/2026-07-06-radius-yield-delivery.md Phase 5.
 */
export const HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK = 1;

/**
 * True when `dockTileKey` has an adjacent (8-neighbor) LAND tile owned by
 * `playerId`, SETTLED, with an active CUSTOMS_HOUSE — i.e. the dock is
 * "supported" by a Harbor Exchange. Mirrors legacy `supportedStructureAtDock`
 * adjacency semantics (legacy-snapshot-economy.ts:342-350) but scoped to
 * CUSTOMS_HOUSE only.
 */
export const dockSupportedByCustomsHouse = (
  dockTileKey: string,
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>
): boolean => {
  const [rawX, rawY] = dockTileKey.split(",");
  const cx = Number(rawX);
  const cy = Number(rawY);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tiles.get(keyFor(cx + dx, cy + dy));
      if (
        neighbor?.ownerId === playerId &&
        neighbor.ownershipState === "SETTLED" &&
        neighbor.economicStructure?.type === "CUSTOMS_HOUSE" &&
        neighbor.economicStructure.status === "active"
      ) {
        return true;
      }
    }
  }
  return false;
};

// Moved from player-update-economy.ts to keep that file from growing past
// its line-count ceiling — no functional/behavioral change, pure relocation.
export const buildFedTownKeys = (
  player: DomainPlayer,
  summary: PlayerRuntimeSummary,
  tiles: ReadonlyMap<string, DomainTileState>,
  strategicProductionPerMinute: Record<DomainStrategicResourceKey, number>
): Set<string> => {
  const availableFood = (player.strategicResources?.FOOD ?? 0) + strategicProductionPerMinute.FOOD;
  let remainingFood = availableFood;
  const fedTownKeys = new Set<string>();
  // Use ownedTownTierByTile (already an index of just owned town tiles) instead
  // of spreading all territoryTileKeys and filtering. O(towns) vs O(territory).
  const ownedSettledTowns = [...summary.ownedTownTierByTile.keys()]
    .map((tileKey) => tiles.get(tileKey))
    .filter((tile): tile is DomainTileState => Boolean(tile?.town && tile.ownerId === player.id && tile.ownershipState === "SETTLED"))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y));
  for (const tile of ownedSettledTowns) {
    const upkeep = townFoodUpkeepPerMinute(tile.town?.populationTier);
    if (upkeep <= 0) {
      fedTownKeys.add(`${tile.x},${tile.y}`);
      continue;
    }
    if (remainingFood + 1e-9 >= upkeep) {
      fedTownKeys.add(`${tile.x},${tile.y}`);
      remainingFood = Math.max(0, remainingFood - upkeep);
    }
  }
  return fedTownKeys;
};

export const dockBaseGoldPerMinuteForPlayer = (
  tile: DomainTileState,
  player: EconomyPlayer,
  context: DockEconomyContext | undefined
): number => {
  if (!tile.dockId || tile.ownerId !== player.id || tile.ownershipState !== "SETTLED") return 0;
  const connectedDockCount = context ? dockConnectedOwnedSettledCount(keyFor(tile.x, tile.y), player.id, context) : 0;
  const base =
    DOCK_INCOME_PER_MIN *
    dockGoldOutputMultiplierForPlayer(player) *
    (1 + dockConnectionBonusPerLinkForPlayer(player) * connectedDockCount);
  const harborExchangeBonus =
    context && dockSupportedByCustomsHouse(keyFor(tile.x, tile.y), player.id, context.tiles)
      ? HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK * connectedDockCount
      : 0;
  return base + harborExchangeBonus;
};
