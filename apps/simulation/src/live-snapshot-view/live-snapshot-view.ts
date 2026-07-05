import type { DomainTileState } from "@border-empires/game-domain";
import { shouldYieldAt } from "../event-loop-yield.js";
import { buildDockLinksByDockTileKey } from "../dock-network/dock-network.js";
import { buildConnectedTownNetworkForPlayer } from "../economy-network/economy-network.js";
import { buildTileYieldView } from "../tile-yield-view/tile-yield-view.js";
import {
  type RuntimeState,
  type LivePlayerEconomySnapshot,
  keyFor,
  snapshotEconomyPlayer,
  getDomainTilesByKey,
  getDomainTilesByKeyAsync,
  buildSettledDomainTilesByPlayerId,
  buildFirstThreeTownKeysByPlayer,
  buildWaterworksKeysByPlayer,
  townKeysWithNearbyWar,
  computeSeedGranaryBuffedTileKeys
} from "../snapshot-tile-cache.js";
import { buildTownSummary } from "../live-town-summary.js";
import type { EconomyPlayer } from "../economy-network/economy-network.js";
import { buildStrategicProductionByPlayer, buildFedTownKeysByPlayer } from "../snapshot-economy-helpers.js";

// Re-exports for callers that import from this module path
export { buildLivePlayerEconomySnapshot } from "../live-economy-snapshot.js";
export { computeSeedGranaryBuffedTileKeysForTest } from "../snapshot-tile-cache.js";

type EnrichmentContext = {
  collectedAtByTile: Map<string, number>;
  playerYieldCollectionEpochByPlayer: Map<string, number>;
  tilesByKey: Map<string, RuntimeState["tiles"][number]>;
  domainTilesByKey: Map<string, DomainTileState>;
  dockLinksByDockTileKey: ReturnType<typeof buildDockLinksByDockTileKey>;
  economyPlayersById: Map<string, NonNullable<ReturnType<typeof snapshotEconomyPlayer>>>;
  townNetworksByPlayerId: Map<string, ReturnType<typeof buildConnectedTownNetworkForPlayer>>;
  firstThreeTownKeysByPlayer: ReturnType<typeof buildFirstThreeTownKeysByPlayer>;
  nearbyWarTownKeys: ReturnType<typeof townKeysWithNearbyWar>;
  fedTownKeysByPlayer: LivePlayerEconomySnapshot["fedTownKeysByPlayer"];
  fedTownKeys: LivePlayerEconomySnapshot["fedTownKeys"];
  seedGranaryBuffedTileKeys: ReadonlySet<string>;
  waterworksKeysByPlayer: Map<string, Set<string>>;
};

const toSharedVisibilityTownSummary = (town: DomainTileState["town"] | undefined): DomainTileState["town"] | undefined => {
  if (!town) return undefined;
  return {
    ...(town.name ? { name: town.name } : {}),
    type: town.type,
    populationTier: town.populationTier,
    ...(typeof town.population === "number" ? { population: town.population } : {}),
    ...(typeof town.maxPopulation === "number" ? { maxPopulation: town.maxPopulation } : {}),
    ...(typeof town.connectedTownCount === "number" ? { connectedTownCount: town.connectedTownCount } : {}),
    ...(typeof town.connectedTownBonus === "number" ? { connectedTownBonus: town.connectedTownBonus } : {}),
    ...(Array.isArray(town.connectedTownNames) ? { connectedTownNames: town.connectedTownNames } : {})
  } as DomainTileState["town"];
};

const buildSnapshotTileYieldFields = (
  tile: RuntimeState["tiles"][number],
  collectedAtByTile: ReadonlyMap<string, number>,
  playerYieldCollectionEpochByPlayer: ReadonlyMap<string, number>,
  town: DomainTileState["town"] | undefined,
  context?: {
    player?: EconomyPlayer | undefined;
    fedTownKeys?: ReadonlySet<string> | undefined;
    firstThreeTownKeys?: ReadonlySet<string> | undefined;
    waterworksKeys?: ReadonlySet<string> | undefined;
    tiles: ReadonlyMap<string, DomainTileState>;
    dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  }
) => {
  const yieldTile: DomainTileState = {
    x: tile.x,
    y: tile.y,
    terrain: tile.terrain ?? "LAND",
    ...(tile.resource ? { resource: tile.resource as DomainTileState["resource"] } : {}),
    ...(tile.dockId ? { dockId: tile.dockId } : {}),
    ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
    ...(tile.ownershipState ? { ownershipState: tile.ownershipState as DomainTileState["ownershipState"] } : {}),
    ...(town ? { town } : tile.townJson ? { town: JSON.parse(tile.townJson) as DomainTileState["town"] } : {}),
    ...(tile.economicStructureJson ? { economicStructure: JSON.parse(tile.economicStructureJson) as DomainTileState["economicStructure"] } : {})
  };
  const tileAnchor = collectedAtByTile.get(keyFor(tile.x, tile.y));
  const playerAnchor = tile.ownerId ? playerYieldCollectionEpochByPlayer.get(tile.ownerId) : undefined;
  const collectedAt =
    typeof tileAnchor === "number" && typeof playerAnchor === "number" ? Math.max(tileAnchor, playerAnchor) : tileAnchor ?? playerAnchor;
  const yieldView = buildTileYieldView(yieldTile, collectedAt, Date.now(), context);
  return {
    ...(yieldView?.yield ? { yield: yieldView.yield } : {})
    // yieldRate and yieldCap are derived client-side from static yield tables
    // + townJson (goldPerMinute/cap). See packages/client/src/yield-derivation.ts.
  };
};

export const enrichSnapshotTilesForGlobalVisibility = (
  runtimeState: RuntimeState
): RuntimeState["tiles"] => {
  const collectedAtByTile = new Map((runtimeState.tileYieldCollectedAtByTile ?? []).map((entry) => [entry.tileKey, entry.collectedAt] as const));
  const playerYieldCollectionEpochByPlayer = new Map(
    (runtimeState.playerYieldCollectionEpochByPlayer ?? []).map((entry) => [entry.playerId, entry.collectedAt] as const)
  );
  const tilesByKey = new Map(runtimeState.tiles.map((entry) => [keyFor(entry.x, entry.y), entry] as const));
  const domainTilesByKey = getDomainTilesByKey(runtimeState);
  const settledDomainTilesByPlayerId = buildSettledDomainTilesByPlayerId(runtimeState, domainTilesByKey);
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const playersById = new Map(runtimeState.players.map((entry) => [entry.id, entry] as const));
  const economyPlayersById = new Map(runtimeState.players.map((entry) => [entry.id, snapshotEconomyPlayer(entry)!] as const));
  const townNetworksByPlayerId = new Map(
    [...economyPlayersById].map(([id, economyPlayer]) => [
      id,
      buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(id) ?? [], {
        maxConnectedTownNames: 16
      })
    ] as const)
  );
  const firstThreeTownKeysByPlayer = buildFirstThreeTownKeysByPlayer(runtimeState);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  const strategicProductionByPlayer = buildStrategicProductionByPlayer(runtimeState);
  const fedTownKeysByPlayer = buildFedTownKeysByPlayer(runtimeState, strategicProductionByPlayer);
  const waterworksKeysByPlayer = buildWaterworksKeysByPlayer(runtimeState);
  return [...runtimeState.tiles]
    .sort((left, right) => (left.x - right.x) || (left.y - right.y))
    .map((tile) => {
      const player = tile.ownerId ? playersById.get(tile.ownerId) : undefined;
      const economyPlayer = tile.ownerId ? economyPlayersById.get(tile.ownerId) : undefined;
      const fedTownKeys = tile.ownerId ? (fedTownKeysByPlayer.get(tile.ownerId) ?? new Set<string>()) : new Set<string>();
      const fullTown = buildTownSummary(
        tile,
        player,
        tilesByKey,
        fedTownKeys,
        true,
        tile.ownerId ? townNetworksByPlayerId.get(tile.ownerId) : undefined,
        tile.ownerId ? firstThreeTownKeysByPlayer.get(tile.ownerId) : undefined,
        nearbyWarTownKeys,
        computeSeedGranaryBuffedTileKeys(runtimeState)
      );
      const town = toSharedVisibilityTownSummary(fullTown);
      const yieldFields = buildSnapshotTileYieldFields(tile, collectedAtByTile, playerYieldCollectionEpochByPlayer, fullTown, {
        ...(economyPlayer ? { player: economyPlayer } : {}),
        fedTownKeys,
        ...(tile.ownerId ? { firstThreeTownKeys: firstThreeTownKeysByPlayer.get(tile.ownerId) } : {}),
        ...(tile.ownerId ? { waterworksKeys: waterworksKeysByPlayer.get(tile.ownerId) } : {}),
        tiles: domainTilesByKey,
        dockLinksByDockTileKey
      });
      if (!town) return { ...tile, ...yieldFields };
      return {
        ...tile,
        townJson: JSON.stringify(town),
        townType: town.type,
        ...(town.name ? { townName: town.name } : {}),
        townPopulationTier: town.populationTier,
        ...yieldFields
      };
    });
};

// Per-tile builder shared by sync + async variants. The 2026-05-20 stall
// traced into this map: `runtimeState.players.find` is O(P) per tile and
// buildTownSummary/buildSnapshotTileYieldFields are non-trivial, so 2000+
// visible tiles blocked the main thread for tens of seconds.
const buildEnrichmentContext = (
  runtimeState: RuntimeState,
  playerEconomy: LivePlayerEconomySnapshot,
  visibleTiles: RuntimeState["tiles"]
): EnrichmentContext => {
  const collectedAtByTile = new Map((runtimeState.tileYieldCollectedAtByTile ?? []).map((entry) => [entry.tileKey, entry.collectedAt] as const));
  const playerYieldCollectionEpochByPlayer = new Map(
    (runtimeState.playerYieldCollectionEpochByPlayer ?? []).map((entry) => [entry.playerId, entry.collectedAt] as const)
  );
  const tilesByKey = new Map(runtimeState.tiles.map((entry) => [keyFor(entry.x, entry.y), entry] as const));
  const domainTilesByKey = getDomainTilesByKey(runtimeState);
  const settledDomainTilesByPlayerId = buildSettledDomainTilesByPlayerId(runtimeState, domainTilesByKey);
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const economyPlayersById = new Map(runtimeState.players.map((entry) => [entry.id, snapshotEconomyPlayer(entry)!] as const));
  const visibleOwnerIds = new Set(visibleTiles.map((tile) => tile.ownerId).filter((id): id is string => Boolean(id)));
  const townNetworksByPlayerId = new Map<string, ReturnType<typeof buildConnectedTownNetworkForPlayer>>();
  for (const id of visibleOwnerIds) {
    const economyPlayer = economyPlayersById.get(id);
    if (!economyPlayer) continue;
    townNetworksByPlayerId.set(
      id,
      buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(id) ?? [], {
        maxConnectedTownNames: 16
      })
    );
  }
  const firstThreeTownKeysByPlayer = buildFirstThreeTownKeysByPlayer(runtimeState);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  const seedGranaryBuffedTileKeys = computeSeedGranaryBuffedTileKeys(runtimeState);
  const waterworksKeysByPlayer = buildWaterworksKeysByPlayer(runtimeState);
  return {
    collectedAtByTile,
    playerYieldCollectionEpochByPlayer,
    tilesByKey,
    domainTilesByKey,
    dockLinksByDockTileKey,
    economyPlayersById,
    townNetworksByPlayerId,
    firstThreeTownKeysByPlayer,
    nearbyWarTownKeys,
    fedTownKeysByPlayer: playerEconomy.fedTownKeysByPlayer,
    fedTownKeys: playerEconomy.fedTownKeys,
    seedGranaryBuffedTileKeys,
    waterworksKeysByPlayer
  };
};

const buildEnrichmentContextAsync = async (
  runtimeState: RuntimeState,
  playerEconomy: LivePlayerEconomySnapshot,
  visibleTiles: RuntimeState["tiles"],
  yieldToEventLoop: () => Promise<void>,
  // Optional pre-built map from the caller — skips an O(202k) scan when the
  // caller (buildPlayerSubscriptionSnapshotAsync) already built it.
  prebuiltTilesByKey?: Map<string, RuntimeState["tiles"][number]>
): Promise<EnrichmentContext> => {
  const collectedAtByTile = new Map((runtimeState.tileYieldCollectedAtByTile ?? []).map((entry) => [entry.tileKey, entry.collectedAt] as const));
  const playerYieldCollectionEpochByPlayer = new Map(
    (runtimeState.playerYieldCollectionEpochByPlayer ?? []).map((entry) => [entry.playerId, entry.collectedAt] as const)
  );
  // domainTilesByKey is almost always cached here — buildLivePlayerEconomySnapshotAsync
  // runs first for each player and populates the cache on the first player's bootstrap.
  const domainTilesByKey = await getDomainTilesByKeyAsync(runtimeState, yieldToEventLoop);
  let tilesByKey: Map<string, RuntimeState["tiles"][number]>;
  if (prebuiltTilesByKey) {
    tilesByKey = prebuiltTilesByKey;
  } else {
    tilesByKey = new Map<string, RuntimeState["tiles"][number]>();
    let tileIndex = 0;
    for (const entry of runtimeState.tiles) {
      if (shouldYieldAt(tileIndex++, 2_000)) await yieldToEventLoop();
      tilesByKey.set(keyFor(entry.x, entry.y), entry);
    }
  }
  // buildSettledDomainTilesByPlayerId is cached — O(1) if populated by an earlier bootstrap.
  const settledDomainTilesByPlayerId = buildSettledDomainTilesByPlayerId(runtimeState, domainTilesByKey);
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const economyPlayersById = new Map(runtimeState.players.map((entry) => [entry.id, snapshotEconomyPlayer(entry)!] as const));
  const visibleOwnerIds = new Set(visibleTiles.map((tile) => tile.ownerId).filter((id): id is string => Boolean(id)));
  const townNetworksByPlayerId = new Map<string, ReturnType<typeof buildConnectedTownNetworkForPlayer>>();
  for (const id of visibleOwnerIds) {
    const economyPlayer = economyPlayersById.get(id);
    if (!economyPlayer) continue;
    townNetworksByPlayerId.set(
      id,
      buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(id) ?? [], {
        maxConnectedTownNames: 16
      })
    );
    await yieldToEventLoop();
  }
  // buildFirstThreeTownKeysByPlayer is cached — O(1) if populated by an earlier bootstrap.
  const firstThreeTownKeysByPlayer = buildFirstThreeTownKeysByPlayer(runtimeState);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  await yieldToEventLoop();
  const seedGranaryBuffedTileKeys = computeSeedGranaryBuffedTileKeys(runtimeState);
  await yieldToEventLoop();
  const waterworksKeysByPlayer = buildWaterworksKeysByPlayer(runtimeState);
  return {
    collectedAtByTile,
    playerYieldCollectionEpochByPlayer,
    tilesByKey,
    domainTilesByKey,
    dockLinksByDockTileKey,
    economyPlayersById,
    townNetworksByPlayerId,
    firstThreeTownKeysByPlayer,
    nearbyWarTownKeys,
    fedTownKeysByPlayer: playerEconomy.fedTownKeysByPlayer,
    fedTownKeys: playerEconomy.fedTownKeys,
    seedGranaryBuffedTileKeys,
    waterworksKeysByPlayer
  };
};

const buildEnrichedTile = (
  playerId: string,
  tile: RuntimeState["tiles"][number],
  ctx: EnrichmentContext,
  playersById: Map<string, RuntimeState["players"][number]>
): RuntimeState["tiles"][number] => {
  // Linear `players.find` was O(P) per tile; pre-indexed lookup is O(1).
  const player = tile.ownerId ? playersById.get(tile.ownerId) : undefined;
  const economyPlayer = tile.ownerId ? ctx.economyPlayersById.get(tile.ownerId) : undefined;
  const town = buildTownSummary(
    tile,
    player,
    ctx.tilesByKey,
    tile.ownerId === playerId ? ctx.fedTownKeys : (tile.ownerId ? (ctx.fedTownKeysByPlayer.get(tile.ownerId) ?? new Set<string>()) : new Set<string>()),
    tile.ownerId === playerId,
    tile.ownerId ? ctx.townNetworksByPlayerId.get(tile.ownerId) : undefined,
    tile.ownerId ? ctx.firstThreeTownKeysByPlayer.get(tile.ownerId) : undefined,
    ctx.nearbyWarTownKeys,
    ctx.seedGranaryBuffedTileKeys
  );
  const yieldFields = buildSnapshotTileYieldFields(tile, ctx.collectedAtByTile, ctx.playerYieldCollectionEpochByPlayer, town, {
    ...(economyPlayer ? { player: economyPlayer } : {}),
    ...(tile.ownerId
      ? { fedTownKeys: tile.ownerId === playerId ? ctx.fedTownKeys : (ctx.fedTownKeysByPlayer.get(tile.ownerId) ?? new Set<string>()) }
      : {}),
    ...(tile.ownerId ? { firstThreeTownKeys: ctx.firstThreeTownKeysByPlayer.get(tile.ownerId) } : {}),
    ...(tile.ownerId ? { waterworksKeys: ctx.waterworksKeysByPlayer.get(tile.ownerId) } : {}),
    tiles: ctx.domainTilesByKey,
    dockLinksByDockTileKey: ctx.dockLinksByDockTileKey
  });
  if (!town) return { ...tile, ...yieldFields };
  return {
    ...tile,
    townJson: JSON.stringify(town),
    townType: town.type,
    ...(town.name ? { townName: town.name } : {}),
    townPopulationTier: town.populationTier,
    ...yieldFields
  };
};

export const enrichSnapshotTilesForPlayer = (
  playerId: string,
  runtimeState: RuntimeState,
  visibleTiles: RuntimeState["tiles"],
  playerEconomy: LivePlayerEconomySnapshot
): RuntimeState["tiles"] => {
  const ctx = buildEnrichmentContext(runtimeState, playerEconomy, visibleTiles);
  const playersById = new Map(runtimeState.players.map((entry) => [entry.id, entry] as const));
  return visibleTiles.map((tile) => buildEnrichedTile(playerId, tile, ctx, playersById));
};
