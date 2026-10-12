import {
  DOCK_CONNECTION_BONUS_PER_LINK_DEFAULT,
  DOCK_INCOME_PER_MIN,
  HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK,
  type DomainPlayer,
  type DomainTileState
} from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, supportRingCandidates, supportRingRadiusForTier, wrapX, wrapY } from "@border-empires/shared";
export { dockBaseGoldPerMinuteForPlayer, dockConnectionBonusPerLinkForPlayer, dockConnectedOwnedSettledCount, dockSupportedByHarborExchange, HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK } from "./economy-network-dock-income.js";

import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import { additiveEffectForPlayer, multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import {
  findConnectivityRoot,
  isCorridorTileForPlayer,
  isTownNodeTileForPlayer,
  type TownConnectivityState
} from "./town-connectivity-incremental.js";
import { supportTileBelongsToTown, hasSupportedStructure, countSupportedStructures } from "./economy-network-support-ring.js";

export type EconomyPlayer = Pick<DomainPlayer, "id" | "techIds" | "domainIds" | "mods" | "wonderDockGoldMultiplier">;

export type ConnectedTownNetworkEntry = {
  connectedTownCount: number;
  connectedTownBonus: number;
  // Subset of directly-connected towns that have an active Clearing House —
  // precomputed once per connectivity group (see buildConnectedTownNetworkForPlayer),
  // not by having every consumer re-scan a full connectedTownKeys list. Bounded
  // by the actual number of Clearing Houses nearby, not by connectedTownCount.
  connectedClearingHouseKeys?: string[];
  // Same precomputation, for Ancillary Depot — feeds the Neural Works network
  // manpower bonus (docs/manpower-economy-rewrite-plan.md §4.4): a Neural Works
  // amplifies every Ancillary Depot in its connected-town network, uncapped.
  connectedAncillaryDepotKeys?: string[];
  // Same precomputation, for Neural Works — used to enforce "only one Rail
  // Depot per connected-town network" at build time (§4.4).
  connectedNeuralWorksKeys?: string[];
  // Census Hall (tech-tree redesign): every connected town with an active
  // Incubation Engine — feeds Census Hall's +20,000 population
  // per connected Incubation Engine bonus.
  connectedIncubationEngineKeys?: string[];
  // Reserve Lattice (tech-tree redesign): mirrors connectedNeuralWorksKeys'
  // "only one per network" uniqueness signal, retargeted at Reserve Lattice.
  connectedReserveLatticeKeys?: string[];
  // Ancillary Factory (tech-tree redesign): feeds Neural Works's narrowed job
  // (+0.1/min manpower regen per connected Ancillary Factory, on top of that
  // Guild's own standalone +0.05/min).
  connectedAncillaryFactoryKeys?: string[];
  connectedTownNames?: string[];
  // Titanium/Umbrite Weapons Factory (design doc "network-clustered combat bonus"):
  // unlike every field above, this is a plain COUNT, not a town-key list, and
  // it is SELF-INCLUSIVE of this town's own copies — every other
  // connected-* field above deliberately excludes the town being queried
  // (callers add its own contribution back in themselves, e.g.
  // neuralWorksNetworkAncillaryDepotCountForPlayer), but combat callers here
  // always want "the whole network's total," so there's no reason to make
  // every call site re-add its own tile's count back on top.
  // buildConnectedTownNetworkForPlayer itself always sets both (including
  // the trivial one-town-network fast path); optional here only so
  // hand-built test fixtures elsewhere that construct a partial
  // ConnectedTownNetworkEntry don't all need updating — real callers should
  // treat a missing value as 0.
  connectedTitaniumWeaponsFactoryCount?: number;
  connectedUmbriteWeaponsFactoryCount?: number;
};

export { supportTileBelongsToTown, hasSupportedStructure, countSupportedStructures };

type TownConnectivityGroup = {
  // Sorted, shared across every town touching this component/group — building
  // it once per group (not once per pair) is what keeps this O(component
  // size) instead of O(towns_in_component²).
  members: string[];
  clearingHouseKeys: string[];
  ancillaryDepotKeys: string[];
  neuralWorksKeys: string[];
  incubationEngineKeys: string[];
  reserveLatticeKeys: string[];
  ancillaryFactoryKeys: string[];
  // Titanium/Umbrite Weapons Factory counts — unlike the *Keys fields above, these
  // are already-summed totals across every member town (self-inclusive), see
  // ConnectedTownNetworkEntry's matching fields for why.
  titaniumWeaponsFactoryCount: number;
  umbriteWeaponsFactoryCount: number;
  // Trade Nexus (tech-tree redesign, Economy branch): the connected-town road
  // network itself only exists where at least one member town has a built
  // Trade Nexus — see the connectedTownCount gate below. Only affects
  // connectedTownCount/connectedTownBonus, not the other per-structure
  // network key lists above (Neural Works/Ancillary Depot/Incubation Engine/etc. are
  // separate systems the plan didn't ask to re-gate).
  tradeNexusKeys: string[];
};

export type DockEconomyContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  // §5.4: dormant economicStructure tile keys ("x,y") for this player — see
  // hasSupportedStructure's matching param. Optional so existing callers
  // that haven't threaded it through yet default to "nothing dormant"
  // rather than a hard type error.
  dormantEconomicStructureKeys?: ReadonlySet<string>;
};

export type ConnectedTownNetworkOptions = {
  maxConnectedTownNames?: number;
  // When supplied, replaces the corridor-component BFS with O(towns × 8)
  // union-find root lookups (see town-connectivity-incremental.ts). Callers
  // that don't maintain one keep the from-scratch BFS, and both paths produce
  // identical group descriptors and output.
  //
  // REQUIREMENT: a caller passing this MUST also pass a `playerSettledTiles`
  // covering every tile the player owns. A partial set would be recorded as a
  // clean union-find and silently under-report connectivity on later reads.
  incrementalState?: TownConnectivityState;
  // §5.4: dormant economicStructure tile keys ("x,y") for this player — see
  // hasSupportedStructure's matching param. Applied to Clearing House/
  // Ancillary Depot membership (real bonuses) but NOT to Neural Works membership
  // (a uniqueness signal only, via hasNeuralWorksAt's includeUnderConstruction
  // mode below).
  dormantEconomicStructureKeys?: ReadonlySet<string>;
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
    // Shared predicates with the incremental maintenance path — see
    // isCorridorTileForPlayer for why these must not be re-derived inline.
    if (isTownNodeTileForPlayer(tile, player.id)) {
      ownedTownKeys.add(keyFor(tile.x, tile.y));
    } else if (isCorridorTileForPlayer(tile, player.id)) {
      nonTownSettledKeys.add(keyFor(tile.x, tile.y));
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
  const dormantEconomicStructureKeys = options.dormantEconomicStructureKeys ?? new Set<string>();

  // Titanium/Umbrite Weapons Factory — unlike hasXAt above, this SUMS instances
  // rather than early-exiting on the first match: both factories are
  // uncapped per town (placementMode "same_tile", structure-placement-metadata.json),
  // so a single town can host many, and the network combat bonus (design
  // doc "network-clustered combat bonus") needs the real count, not a
  // boolean. Mirrors hasAncillaryDepotAt's dual on-tile + support-tile check
  // (same_tile placement means a copy can sit directly on the town tile
  // itself, not just on a support tile around it). Declared before the
  // ownedTownKeys.size <= 1 fast-return below since that trivial
  // one-town-network case still needs its own count (a "network of one" is
  // still self-inclusive of that lone town's copies).
  const countWeaponsFactoriesAt = (townKey: string, structureType: "TITANIUM_WEAPONS_FACTORY" | "UMBRITE_WEAPONS_FACTORY"): number => {
    const tile = tiles.get(townKey);
    if (!tile) return 0;
    let count = 0;
    if (
      tile.economicStructure?.ownerId === player.id &&
      tile.economicStructure.type === structureType &&
      tile.economicStructure.status === "active" &&
      !dormantEconomicStructureKeys.has(townKey)
    ) {
      count += 1;
    }
    const radius = supportRingRadiusForTier(tile.town?.populationTier);
    for (const { tile: neighbor } of supportRingCandidates(tiles, tile.x, tile.y, radius)) {
      if (neighbor.ownerId !== player.id || neighbor.ownershipState !== "SETTLED") continue;
      if (!supportTileBelongsToTown(player.id, neighbor, tile, tiles)) continue;
      const structure = neighbor.economicStructure;
      if (
        structure?.ownerId === player.id &&
        structure.type === structureType &&
        structure.status === "active" &&
        !dormantEconomicStructureKeys.has(`${neighbor.x},${neighbor.y}`)
      ) {
        count += 1;
      }
    }
    return count;
  };
  const countTitaniumWeaponsFactoriesAt = (townKey: string): number => countWeaponsFactoriesAt(townKey, "TITANIUM_WEAPONS_FACTORY");
  const countUmbriteWeaponsFactoriesAt = (townKey: string): number => countWeaponsFactoriesAt(townKey, "UMBRITE_WEAPONS_FACTORY");

  if (ownedTownKeys.size <= 1) {
    const out = new Map<string, ConnectedTownNetworkEntry>();
    for (const townKey of ownedTownKeys) {
      out.set(townKey, {
        connectedTownCount: 0,
        connectedTownBonus: connectedTownBonusForPlayer(0, player),
        connectedTitaniumWeaponsFactoryCount: countTitaniumWeaponsFactoriesAt(townKey),
        connectedUmbriteWeaponsFactoryCount: countUmbriteWeaponsFactoriesAt(townKey)
      });
    }
    return out;
  }

  const hasClearingHouseAt = (townKey: string): boolean => {
    const tile = tiles.get(townKey);
    return tile ? hasSupportedStructure(player.id, tile, "CLEARING_HOUSE", tiles, false, dormantEconomicStructureKeys) : false;
  };

  // ANCILLARY_DEPOT uses "same_tile" placement (structure-placement-metadata.json),
  // unlike CLEARING_HOUSE/NEURAL_WORKS's "town_support" mode — it can sit
  // directly ON the town tile itself, not just on an adjacent support tile,
  // so both must be checked here.
  const hasAncillaryDepotAt = (townKey: string): boolean => {
    const tile = tiles.get(townKey);
    if (!tile) return false;
    const onTownTileItself =
      tile.economicStructure?.ownerId === player.id &&
      tile.economicStructure.type === "ANCILLARY_DEPOT" &&
      tile.economicStructure.status === "active" &&
      !dormantEconomicStructureKeys.has(townKey);
    return onTownTileItself || hasSupportedStructure(player.id, tile, "ANCILLARY_DEPOT", tiles, false, dormantEconomicStructureKeys);
  };

  // Neural Works membership is purely a uniqueness signal (feeds
  // neuralWorksAlreadyInNetwork, never a bonus amount), so it counts
  // under_construction too — see hasSupportedStructure's doc comment.
  const hasNeuralWorksAt = (townKey: string): boolean => {
    const tile = tiles.get(townKey);
    return tile ? hasSupportedStructure(player.id, tile, "NEURAL_WORKS", tiles, true) : false;
  };

  // Incubation Engine — used for Census Hall's connected-network
  // population bonus. Active-only (a dormant Incubation Engine already granted its
  // one-time burst, but shouldn't keep counting toward the live bonus).
  const hasIncubationEngineAt = (townKey: string): boolean => {
    const tile = tiles.get(townKey);
    return tile ? hasSupportedStructure(player.id, tile, "INCUBATION_ENGINE", tiles, false, dormantEconomicStructureKeys) : false;
  };

  // Reserve Lattice — mirrors hasNeuralWorksAt's uniqueness-signal shape
  // (counts under_construction too, so two Reserve Lattice submitted before
  // either completes can't both land in the same network).
  const hasReserveLatticeAt = (townKey: string): boolean => {
    const tile = tiles.get(townKey);
    return tile ? hasSupportedStructure(player.id, tile, "RESERVE_LATTICE", tiles, true) : false;
  };

  // Ancillary Factory — feeds Neural Works's narrowed regen amplification job.
  const hasAncillaryFactoryAt = (townKey: string): boolean => {
    const tile = tiles.get(townKey);
    return tile ? hasSupportedStructure(player.id, tile, "ANCILLARY_FACTORY", tiles, false, dormantEconomicStructureKeys) : false;
  };

  // Trade Nexus — gates the connected-town road network itself (see
  // connectedTownCount below), not just an amplifier on top of it.
  const hasTradeNexusAt = (townKey: string): boolean => {
    const tile = tiles.get(townKey);
    return tile ? hasSupportedStructure(player.id, tile, "TRADE_NEXUS", tiles, false, dormantEconomicStructureKeys) : false;
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
  const groupsByTown = new Map<string, TownConnectivityGroup[]>();

  // Shared by both the BFS and incremental grouping paths below, so they can
  // only ever differ in HOW corridor components are identified — never in the
  // group descriptors they produce or the output built from them.
  const registerGroup = (adjacentTownKeys: ReadonlySet<string>): void => {
    if (adjacentTownKeys.size === 0) return;
    const members = [...adjacentTownKeys].sort((l, r) => l.localeCompare(r));
    const group: TownConnectivityGroup = {
      members,
      clearingHouseKeys: members.filter(hasClearingHouseAt),
      ancillaryDepotKeys: members.filter(hasAncillaryDepotAt),
      neuralWorksKeys: members.filter(hasNeuralWorksAt),
      incubationEngineKeys: members.filter(hasIncubationEngineAt),
      reserveLatticeKeys: members.filter(hasReserveLatticeAt),
      ancillaryFactoryKeys: members.filter(hasAncillaryFactoryAt),
      titaniumWeaponsFactoryCount: members.reduce((sum, key) => sum + countTitaniumWeaponsFactoriesAt(key), 0),
      umbriteWeaponsFactoryCount: members.reduce((sum, key) => sum + countUmbriteWeaponsFactoriesAt(key), 0),
      tradeNexusKeys: members.filter(hasTradeNexusAt)
    };
    for (const townKey of members) {
      let list = groupsByTown.get(townKey);
      if (!list) {
        list = [];
        groupsByTown.set(townKey, list);
      }
      list.push(group);
    }
  };

  // The BFS is needed when there's no incremental state at all, or when a
  // shrink-type mutation invalidated it. Otherwise corridor components are
  // read straight off the union-find.
  const incrementalState = options.incrementalState;

  if (incrementalState && !incrementalState.dirty) {
    // Step 2 (incremental): the caller maintains a union-find over this
    // player's corridor tiles (see town-connectivity-incremental.ts), kept in
    // sync on tile mutations by maintainTownConnectivityForTileChange.
    // Corridor components are read off in O(towns × 8) — one root lookup per
    // town neighborhood — skipping the O(corridor tiles) BFS entirely.
    const state = incrementalState;
    const townKeysByCorridorRoot = new Map<string, Set<string>>();
    for (const townKey of ownedTownKeys) {
      const [rawX, rawY] = townKey.split(",");
      const cx = Number(rawX), cy = Number(rawY);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const neighborKey = keyFor(cx + dx, cy + dy);
          // Verified against the live corridor set, not just the union-find,
          // so stale parent-map entries can never inject a phantom corridor.
          if (!nonTownSettledKeys.has(neighborKey)) continue;
          const root = findConnectivityRoot(state, neighborKey);
          let townKeysForRoot = townKeysByCorridorRoot.get(root);
          if (!townKeysForRoot) {
            townKeysForRoot = new Set<string>();
            townKeysByCorridorRoot.set(root, townKeysForRoot);
          }
          townKeysForRoot.add(townKey);
        }
      }
    }
    for (const adjacentTownKeys of townKeysByCorridorRoot.values()) registerGroup(adjacentTownKeys);
  } else {
    // Step 2 (from scratch): single BFS pass over connected components of
    // non-town settled tiles — O(N) total. Every town 8-adjacent to any tile
    // in a component is connected to every other such town through that
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

    // When an incremental state exists but was dirty, rebuild it from THIS
    // traversal rather than paying a second independent O(corridor tiles ×
    // 8-neighbor) pass: the BFS already discovers exactly the components the
    // union-find represents, so seeding is just one parent write per tile.
    // (Measured: a separate rebuild made the dirty path ~9% slower than the
    // plain BFS; seeding keeps it at parity.)
    const stateToSeed = incrementalState;
    if (stateToSeed) {
      stateToSeed.parent.clear();
      stateToSeed.dirty = false;
    }

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

      // `queue` holds exactly this component's corridor tiles, so all of them
      // share one root. Done before registerGroup's early-return so that
      // town-less components are recorded too — they still have to be
      // unionable when a future tile settles next to them.
      if (stateToSeed) {
        const root = queue[0]!;
        for (const componentKey of queue) stateToSeed.parent.set(componentKey, root);
      }

      registerGroup(adjacentTownKeys);
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
    let ancillaryDepotKeys: string[];
    let neuralWorksKeys: string[];
    let incubationEngineKeys: string[];
    let reserveLatticeKeys: string[];
    let ancillaryFactoryKeys: string[];
    let memberKeysForNames: string[] | undefined;
    let titaniumWeaponsFactoryCount: number;
    let umbriteWeaponsFactoryCount: number;

    let networkHasTradeNexus: boolean;

    if (direct.size === 0 && groups && groups.length === 1) {
      const group = groups[0]!;
      connectedTownCount = group.members.length - 1;
      networkHasTradeNexus = group.tradeNexusKeys.length > 0;
      // Self-inclusive total (unlike the *Keys fields below) — group.members
      // already includes townKey, so group.titaniumWeaponsFactoryCount/
      // umbriteWeaponsFactoryCount already count its own copies. No filtering
      // needed.
      titaniumWeaponsFactoryCount = group.titaniumWeaponsFactoryCount;
      umbriteWeaponsFactoryCount = group.umbriteWeaponsFactoryCount;
      clearingHouseKeys = group.clearingHouseKeys.includes(townKey)
        ? group.clearingHouseKeys.filter((k) => k !== townKey)
        : group.clearingHouseKeys;
      ancillaryDepotKeys = group.ancillaryDepotKeys.includes(townKey)
        ? group.ancillaryDepotKeys.filter((k) => k !== townKey)
        : group.ancillaryDepotKeys;
      neuralWorksKeys = group.neuralWorksKeys.includes(townKey)
        ? group.neuralWorksKeys.filter((k) => k !== townKey)
        : group.neuralWorksKeys;
      incubationEngineKeys = group.incubationEngineKeys.includes(townKey)
        ? group.incubationEngineKeys.filter((k) => k !== townKey)
        : group.incubationEngineKeys;
      reserveLatticeKeys = group.reserveLatticeKeys.includes(townKey)
        ? group.reserveLatticeKeys.filter((k) => k !== townKey)
        : group.reserveLatticeKeys;
      ancillaryFactoryKeys = group.ancillaryFactoryKeys.includes(townKey)
        ? group.ancillaryFactoryKeys.filter((k) => k !== townKey)
        : group.ancillaryFactoryKeys;
      memberKeysForNames =
        connectedTownCount > 0 && connectedTownCount <= maxConnectedTownNames
          ? group.members.filter((k) => k !== townKey)
          : undefined;
    } else if (direct.size === 0 && (!groups || groups.length === 0)) {
      connectedTownCount = 0;
      networkHasTradeNexus = false;
      clearingHouseKeys = [];
      ancillaryDepotKeys = [];
      neuralWorksKeys = [];
      incubationEngineKeys = [];
      reserveLatticeKeys = [];
      ancillaryFactoryKeys = [];
      memberKeysForNames = undefined;
      // Isolated town, no connections at all — still a "network of one," so
      // its own copies still count (self-inclusive, not zero).
      titaniumWeaponsFactoryCount = countTitaniumWeaponsFactoriesAt(townKey);
      umbriteWeaponsFactoryCount = countUmbriteWeaponsFactoriesAt(townKey);
    } else {
      const unionSet = new Set<string>(direct);
      for (const group of groups ?? []) {
        for (const member of group.members) {
          if (member !== townKey) unionSet.add(member);
        }
      }
      connectedTownCount = unionSet.size;
      networkHasTradeNexus =
        hasTradeNexusAt(townKey) ||
        [...direct].some(hasTradeNexusAt) ||
        (groups ?? []).some((group) => group.tradeNexusKeys.length > 0);
      const clearingHouseSet = new Set<string>();
      for (const key of direct) if (hasClearingHouseAt(key)) clearingHouseSet.add(key);
      for (const group of groups ?? []) {
        for (const key of group.clearingHouseKeys) if (key !== townKey) clearingHouseSet.add(key);
      }
      const ancillaryDepotSet = new Set<string>();
      for (const key of direct) if (hasAncillaryDepotAt(key)) ancillaryDepotSet.add(key);
      for (const group of groups ?? []) {
        for (const key of group.ancillaryDepotKeys) if (key !== townKey) ancillaryDepotSet.add(key);
      }
      const neuralWorksSet = new Set<string>();
      for (const key of direct) if (hasNeuralWorksAt(key)) neuralWorksSet.add(key);
      for (const group of groups ?? []) {
        for (const key of group.neuralWorksKeys) if (key !== townKey) neuralWorksSet.add(key);
      }
      const incubationEngineSet = new Set<string>();
      for (const key of direct) if (hasIncubationEngineAt(key)) incubationEngineSet.add(key);
      for (const group of groups ?? []) {
        for (const key of group.incubationEngineKeys) if (key !== townKey) incubationEngineSet.add(key);
      }
      const reserveLatticeSet = new Set<string>();
      for (const key of direct) if (hasReserveLatticeAt(key)) reserveLatticeSet.add(key);
      for (const group of groups ?? []) {
        for (const key of group.reserveLatticeKeys) if (key !== townKey) reserveLatticeSet.add(key);
      }
      const ancillaryFactorySet = new Set<string>();
      for (const key of direct) if (hasAncillaryFactoryAt(key)) ancillaryFactorySet.add(key);
      for (const group of groups ?? []) {
        for (const key of group.ancillaryFactoryKeys) if (key !== townKey) ancillaryFactorySet.add(key);
      }
      // Sorted for determinism: this set accumulates across `groups`, whose
      // discovery order differs between the BFS and incremental grouping
      // paths (and is Set-iteration-order dependent in general). The
      // single-group fast path above is already sorted (group.members is),
      // so sorting here makes every entry's ordering stable — otherwise
      // equivalent worlds could emit different tile-delta JSON and churn
      // client state for no reason.
      clearingHouseKeys = [...clearingHouseSet].sort((l, r) => l.localeCompare(r));
      ancillaryDepotKeys = [...ancillaryDepotSet].sort((l, r) => l.localeCompare(r));
      neuralWorksKeys = [...neuralWorksSet].sort((l, r) => l.localeCompare(r));
      incubationEngineKeys = [...incubationEngineSet].sort((l, r) => l.localeCompare(r));
      reserveLatticeKeys = [...reserveLatticeSet].sort((l, r) => l.localeCompare(r));
      ancillaryFactoryKeys = [...ancillaryFactorySet].sort((l, r) => l.localeCompare(r));
      memberKeysForNames =
        connectedTownCount > 0 && connectedTownCount <= maxConnectedTownNames
          ? [...unionSet].sort((l, r) => l.localeCompare(r))
          : undefined;
      // Self-inclusive total: townKey's own copies plus every OTHER member
      // of unionSet (already deduped, so no double-counting a town that's
      // reachable through more than one corridor group).
      titaniumWeaponsFactoryCount =
        countTitaniumWeaponsFactoriesAt(townKey) +
        [...unionSet].reduce((sum, key) => sum + countTitaniumWeaponsFactoriesAt(key), 0);
      umbriteWeaponsFactoryCount =
        countUmbriteWeaponsFactoriesAt(townKey) +
        [...unionSet].reduce((sum, key) => sum + countUmbriteWeaponsFactoriesAt(key), 0);
    }

    const connectedTownNames = memberKeysForNames
      ? memberKeysForNames
          .map((k) => tiles.get(k)?.town?.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0)
          .sort((l, r) => l.localeCompare(r))
      : [];

    out.set(townKey, {
      connectedTownCount,
      // Trade Nexus redesign: connectedTownCount/connectedTownNames stay a
      // pure geometric fact (used by tile-detail UI, visibility exports,
      // etc.), but the actual gold bonus only flows if the road network has
      // a Trade Nexus built somewhere in it.
      connectedTownBonus: networkHasTradeNexus ? connectedTownBonusForPlayer(connectedTownCount, player) : 0,
      ...(clearingHouseKeys.length ? { connectedClearingHouseKeys: clearingHouseKeys } : {}),
      ...(ancillaryDepotKeys.length ? { connectedAncillaryDepotKeys: ancillaryDepotKeys } : {}),
      ...(neuralWorksKeys.length ? { connectedNeuralWorksKeys: neuralWorksKeys } : {}),
      ...(incubationEngineKeys.length ? { connectedIncubationEngineKeys: incubationEngineKeys } : {}),
      ...(reserveLatticeKeys.length ? { connectedReserveLatticeKeys: reserveLatticeKeys } : {}),
      ...(ancillaryFactoryKeys.length ? { connectedAncillaryFactoryKeys: ancillaryFactoryKeys } : {}),
      ...(connectedTownNames.length ? { connectedTownNames } : {}),
      connectedTitaniumWeaponsFactoryCount: titaniumWeaponsFactoryCount,
      connectedUmbriteWeaponsFactoryCount: umbriteWeaponsFactoryCount
    });
  }
  return out;
};

/**
 * docs/manpower-economy-rewrite-plan.md §4.4: Neural Works is the enabler of a
 * network-wide manpower bonus. For every one of the player's own towns that
 * itself hosts an active Neural Works, count that town's own Ancillary Depot (if
 * any) plus every Ancillary Depot in its connected-town network — summed
 * across all of the player's Neural-Works-hosting towns. Correct as long as
 * "only one Neural Works per network" (see neuralWorksAlreadyInNetwork, enforced
 * at build time) holds — otherwise a second Neural Works inside an
 * already-covered network would double-count that network's Ancillary Depots.
 */
export const neuralWorksNetworkAncillaryDepotCountForPlayer = (
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  townNetwork: ReadonlyMap<string, ConnectedTownNetworkEntry>,
  ownedTownTileKeys: Iterable<string>,
  // §5.4: a dormant Neural Works can't amplify anything, and a dormant
  // same-tile Ancillary Depot doesn't contribute its own +1 — see
  // hasSupportedStructure's matching param.
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): number => {
  let total = 0;
  for (const townKey of ownedTownTileKeys) {
    const tile = tiles.get(townKey);
    if (!tile || !hasSupportedStructure(playerId, tile, "NEURAL_WORKS", tiles, false, dormantEconomicStructureKeys)) continue;
    const entry = townNetwork.get(townKey);
    total +=
      (entry?.connectedAncillaryDepotKeys?.length ?? 0) +
      (hasSupportedStructure(playerId, tile, "ANCILLARY_DEPOT", tiles, false, dormantEconomicStructureKeys) ? 1 : 0);
  }
  return total;
};

/**
 * True when `townKey`'s connected-town network already has a Neural Works —
 * either at the town itself or at any town in its network — active OR still
 * under_construction. Checked before allowing a new Neural Works build (§4.4:
 * "only one Neural Works may be built per connected-town network"). Counting
 * under_construction matters: completeStructureBuild never re-validates
 * uniqueness when a build finishes, so if this only checked "active", two
 * Neural Works builds submitted before either completes would both pass and
 * leave the network with two permanent depots.
 */
export const neuralWorksAlreadyInNetwork = (
  playerId: string,
  townKey: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  townNetwork: ReadonlyMap<string, ConnectedTownNetworkEntry>
): boolean => {
  const tile = tiles.get(townKey);
  if (tile && hasSupportedStructure(playerId, tile, "NEURAL_WORKS", tiles, true)) return true;
  const entry = townNetwork.get(townKey);
  return Boolean(entry?.connectedNeuralWorksKeys?.length);
};

/**
 * Reserve Lattice (tech-tree redesign): mirrors neuralWorksNetworkAncillaryDepotCountForPlayer's
 * shape exactly, retargeted — Reserve Lattice is now the sole amplifier of
 * Ancillary Factory (Ancillary Depot) manpower cap (+300 per connected
 * Ancillary Factory, NEURAL_WORKS_NETWORK_MANPOWER_CAP_PER_ANCILLARY_DEPOT),
 * Neural Works no longer touches Ancillary Depot at all.
 */
export const reserveLatticeNetworkAncillaryDepotCountForPlayer = (
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  townNetwork: ReadonlyMap<string, ConnectedTownNetworkEntry>,
  ownedTownTileKeys: Iterable<string>,
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): number => {
  let total = 0;
  for (const townKey of ownedTownTileKeys) {
    const tile = tiles.get(townKey);
    if (!tile || !hasSupportedStructure(playerId, tile, "RESERVE_LATTICE", tiles, false, dormantEconomicStructureKeys)) continue;
    const entry = townNetwork.get(townKey);
    total +=
      (entry?.connectedAncillaryDepotKeys?.length ?? 0) +
      (hasSupportedStructure(playerId, tile, "ANCILLARY_DEPOT", tiles, false, dormantEconomicStructureKeys) ? 1 : 0);
  }
  return total;
};

/** Mirrors neuralWorksAlreadyInNetwork's shape exactly, retargeted at Reserve Lattice. */
export const reserveLatticeAlreadyInNetwork = (
  playerId: string,
  townKey: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  townNetwork: ReadonlyMap<string, ConnectedTownNetworkEntry>
): boolean => {
  const tile = tiles.get(townKey);
  if (tile && hasSupportedStructure(playerId, tile, "RESERVE_LATTICE", tiles, true)) return true;
  const entry = townNetwork.get(townKey);
  return Boolean(entry?.connectedReserveLatticeKeys?.length);
};

/**
 * Neural Works's narrowed job (tech-tree redesign): +0.1/min manpower regen per
 * connected Ancillary Factory, on top of each Guild's own standalone
 * +0.05/min. Ancillary Factory amplification moved to Reserve Lattice above.
 */
export const neuralWorksNetworkAncillaryFactoryCountForPlayer = (
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  townNetwork: ReadonlyMap<string, ConnectedTownNetworkEntry>,
  ownedTownTileKeys: Iterable<string>,
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): number => {
  let total = 0;
  for (const townKey of ownedTownTileKeys) {
    const tile = tiles.get(townKey);
    if (!tile || !hasSupportedStructure(playerId, tile, "NEURAL_WORKS", tiles, false, dormantEconomicStructureKeys)) continue;
    const entry = townNetwork.get(townKey);
    total +=
      (entry?.connectedAncillaryFactoryKeys?.length ?? 0) +
      (hasSupportedStructure(playerId, tile, "ANCILLARY_FACTORY", tiles, false, dormantEconomicStructureKeys) ? 1 : 0);
  }
  return total;
};

/**
 * Census Hall (tech-tree redesign): count of connected towns (in the Census
 * Hall's own town's connected-town network) with an active Incubation Engine
 * (Incubation Engine) — the Census Hall's own town's Incubation Engine counts too, via
 * the same "+1 for the anchor's own copy" shape as the Neural Works functions
 * above.
 */
export const censusHallConnectedIncubationEngineCountForPlayer = (
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  townNetwork: ReadonlyMap<string, ConnectedTownNetworkEntry>,
  censusHallTownKey: string,
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): number => {
  const tile = tiles.get(censusHallTownKey);
  if (!tile) return 0;
  const entry = townNetwork.get(censusHallTownKey);
  return (
    (entry?.connectedIncubationEngineKeys?.length ?? 0) +
    (hasSupportedStructure(playerId, tile, "INCUBATION_ENGINE", tiles, false, dormantEconomicStructureKeys) ? 1 : 0)
  );
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
    if (
      tile.town.connectedTownCount === 0 &&
      tile.town.connectedTownBonus === 0 &&
      !tile.town.connectedTownNames &&
      !tile.town.connectedTitaniumWeaponsFactoryCount &&
      !tile.town.connectedUmbriteWeaponsFactoryCount
    ) {
      return tile.town;
    }
    const { connectedTownNames: _drop, ...rest } = tile.town;
    return { ...rest, connectedTownCount: 0, connectedTownBonus: 0, connectedTitaniumWeaponsFactoryCount: 0, connectedUmbriteWeaponsFactoryCount: 0 };
  }
  const entry = townNetwork?.get(keyFor(tile.x, tile.y));
  if (!entry) return tile.town;
  return {
    ...tile.town,
    connectedTownCount: entry.connectedTownCount,
    connectedTownBonus: entry.connectedTownBonus,
    connectedTitaniumWeaponsFactoryCount: entry.connectedTitaniumWeaponsFactoryCount ?? 0,
    connectedUmbriteWeaponsFactoryCount: entry.connectedUmbriteWeaponsFactoryCount ?? 0,
    ...(entry.connectedTownNames ? { connectedTownNames: entry.connectedTownNames } : {})
  };
};

export const dockGoldOutputMultiplierForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => multiplicativeEffectForPlayer(player, "dockGoldOutputMult");

export {
  firstThreeTownKeysForPlayer,
  firstThreeTownsGoldOutputMultiplierForPlayer,
  firstThreeTownsPopulationGrowthMultiplierForPlayer,
  firstThreeTownMultipliersForTile
} from "./economy-network-first-three-towns.js";


// §5.4/§5.3 (docs/manpower-economy-rewrite-plan.md): a town is "fed" (produces
// gold/manpower, can grow) exactly when its FOOD *slot* demand isn't dormant
// — FOOD no longer has a separate stockpile/flow gate (there's only one food
// mechanic now: slots). `foodDormantTownKeys` is the FOOD-resource dormancy
// set for this player (resourceSlotDormantContributorsForPlayer's `:town`
// entries, stripped to plain tile keys) — see Runtime.foodDormantTownKeysForPlayer.
export const buildFedTownKeys = (
  playerId: string,
  summary: PlayerRuntimeSummary,
  tiles: ReadonlyMap<string, DomainTileState>,
  foodDormantTownKeys: ReadonlySet<string>
): Set<string> => {
  const fedTownKeys = new Set<string>();
  for (const tileKey of summary.ownedTownTierByTile.keys()) {
    const tile = tiles.get(tileKey);
    if (!tile?.town || tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    const key = `${tile.x},${tile.y}`;
    if (!foodDormantTownKeys.has(key)) fedTownKeys.add(key);
  }
  return fedTownKeys;
};
