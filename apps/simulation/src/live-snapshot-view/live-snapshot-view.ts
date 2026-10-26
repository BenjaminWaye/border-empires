import { districtOverlayProjection } from "../town-district/town-district-projection.js";
import type { DomainTileState } from "@border-empires/game-domain";
import { buildDockLinksByDockTileKey } from "../dock-network/dock-network.js";
import { buildConnectedTownNetworkForPlayer } from "../economy-network/economy-network.js";
import { buildTileYieldView, tileYieldNeedsServerAuthority } from "../tile-yield-view/tile-yield-view.js";
import {
  type RuntimeState,
  type LivePlayerEconomySnapshot,
  keyFor,
  snapshotEconomyPlayer,
  getDomainTilesByKey,
  buildSettledDomainTilesByPlayerId,
  buildFirstThreeTownKeysByPlayer,
  townKeysWithNearbyWar
} from "../snapshot-tile-cache.js";
import { buildTownSummary } from "../live-town-summary.js";
import type { EconomyPlayer } from "../economy-network/economy-network.js";
import {
  buildFedTownKeysByPlayer,
  buildResourceSlotDormancyByPlayer,
  dormantEconomicStructureKeysFromDormancy
} from "../snapshot-economy-helpers.js";

// Re-exports for callers that import from this module path
export { buildLivePlayerEconomySnapshot } from "../live-economy-snapshot.js";

type EnrichmentContext = {
  tilesByKey: Map<string, RuntimeState["tiles"][number]>;
  domainTilesByKey: Map<string, DomainTileState>;
  dockLinksByDockTileKey: ReturnType<typeof buildDockLinksByDockTileKey>;
  economyPlayersById: Map<string, NonNullable<ReturnType<typeof snapshotEconomyPlayer>>>;
  townNetworksByPlayerId: Map<string, ReturnType<typeof buildConnectedTownNetworkForPlayer>>;
  firstThreeTownKeysByPlayer: ReturnType<typeof buildFirstThreeTownKeysByPlayer>;
  nearbyWarTownKeys: ReturnType<typeof townKeysWithNearbyWar>;
  fedTownKeysByPlayer: LivePlayerEconomySnapshot["fedTownKeysByPlayer"];
  fedTownKeys: LivePlayerEconomySnapshot["fedTownKeys"];
  // §5.4: dormant economicStructure tile keys ("x,y") per player.
  dormantEconomicStructureKeysByPlayer: Map<string, ReadonlySet<string>>;
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

// yieldRate is derived client-side EXCEPT for dock tiles, whose income the
// client can't re-derive (dock-link topology) — see
// tileYieldNeedsServerAuthority. Only built when it will be emitted.
const buildSnapshotTileYieldFields = (
  tile: RuntimeState["tiles"][number],
  town: DomainTileState["town"] | undefined,
  context: {
    player?: EconomyPlayer | undefined;
    fedTownKeys?: ReadonlySet<string> | undefined;
    firstThreeTownKeys?: ReadonlySet<string> | undefined;
    tiles: ReadonlyMap<string, DomainTileState>;
    dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  }
) => {
  if (!tileYieldNeedsServerAuthority(tile)) return {};
  const yieldTile: DomainTileState = {
    x: tile.x,
    y: tile.y,
    terrain: tile.terrain ?? "LAND",
    ...(tile.dockId ? { dockId: tile.dockId } : {}),
    ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
    ...(tile.ownershipState ? { ownershipState: tile.ownershipState as DomainTileState["ownershipState"] } : {}),
    ...(town ? { town } : tile.townJson ? { town: JSON.parse(tile.townJson) as DomainTileState["town"] } : {})
  };
  const yieldView = buildTileYieldView(yieldTile, Date.now(), context);
  return yieldView ? { yieldRate: yieldView.yieldRate } : {};
};

export const enrichSnapshotTilesForGlobalVisibility = (
  runtimeState: RuntimeState
): RuntimeState["tiles"] => {
  const tilesByKey = new Map(runtimeState.tiles.map((entry) => [keyFor(entry.x, entry.y), entry] as const));
  const domainTilesByKey = getDomainTilesByKey(runtimeState);
  const settledDomainTilesByPlayerId = buildSettledDomainTilesByPlayerId(runtimeState, domainTilesByKey);
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const playersById = new Map(runtimeState.players.map((entry) => [entry.id, entry] as const));
  const economyPlayersById = new Map(runtimeState.players.map((entry) => [entry.id, snapshotEconomyPlayer(entry)!] as const));
  const dormancyByPlayer = buildResourceSlotDormancyByPlayer(runtimeState);
  const dormantEconomicStructureKeysByPlayer = new Map(
    [...dormancyByPlayer].map(([id, dormancy]) => [id, dormantEconomicStructureKeysFromDormancy(dormancy)] as const)
  );
  const townNetworksByPlayerId = new Map(
    [...economyPlayersById].map(([id, economyPlayer]) => [
      id,
      buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(id) ?? [], {
        maxConnectedTownNames: 16,
        dormantEconomicStructureKeys: dormantEconomicStructureKeysByPlayer.get(id) ?? new Set<string>()
      })
    ] as const)
  );
  const firstThreeTownKeysByPlayer = buildFirstThreeTownKeysByPlayer(runtimeState);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  const fedTownKeysByPlayer = buildFedTownKeysByPlayer(runtimeState, dormancyByPlayer);
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
        (tile.ownerId ? dormantEconomicStructureKeysByPlayer.get(tile.ownerId) : undefined) ?? new Set<string>()
      );
      const town = toSharedVisibilityTownSummary(fullTown);
      const yieldFields = buildSnapshotTileYieldFields(tile, fullTown, {
        ...(economyPlayer ? { player: economyPlayer } : {}),
        fedTownKeys,
        ...(tile.ownerId ? { firstThreeTownKeys: firstThreeTownKeysByPlayer.get(tile.ownerId) } : {}),
        tiles: domainTilesByKey,
        dockLinksByDockTileKey
      });
      const domainTile = tile.economicStructureJson || tile.observatoryJson
        ? domainTilesByKey.get(keyFor(tile.x, tile.y)) : undefined;
      const district = domainTile ? districtOverlayProjection(domainTilesByKey, domainTile, () => true) : {};
      if (!town) return { ...tile, ...yieldFields, ...district };
      return {
        ...tile,
        ...district,
        townJson: JSON.stringify(town),
        townType: town.type,
        ...(town.name ? { townName: town.name } : {}),
        townPopulationTier: town.populationTier,
        ...yieldFields
      };
    });
};

// Per-tile builder. The 2026-05-20 stall traced into this map:
// `runtimeState.players.find` is O(P) per tile and buildTownSummary/
// buildSnapshotTileYieldFields are non-trivial, so 2000+ visible tiles
// blocked the main thread for tens of seconds. The fog-of-war login path
// (enrichSnapshotTilesForPlayer, the caller here) always runs off the main
// thread inside snapshot-build-worker.ts, so this stays synchronous — no
// async/yielding variant is needed.
const buildEnrichmentContext = (
  runtimeState: RuntimeState,
  playerEconomy: LivePlayerEconomySnapshot,
  visibleTiles: RuntimeState["tiles"]
): EnrichmentContext => {
  const tilesByKey = new Map(runtimeState.tiles.map((entry) => [keyFor(entry.x, entry.y), entry] as const));
  const domainTilesByKey = getDomainTilesByKey(runtimeState);
  const settledDomainTilesByPlayerId = buildSettledDomainTilesByPlayerId(runtimeState, domainTilesByKey);
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const economyPlayersById = new Map(runtimeState.players.map((entry) => [entry.id, snapshotEconomyPlayer(entry)!] as const));
  const visibleOwnerIds = new Set(visibleTiles.map((tile) => tile.ownerId).filter((id): id is string => Boolean(id)));
  const dormancyByPlayer = buildResourceSlotDormancyByPlayer(runtimeState);
  const dormantEconomicStructureKeysByPlayer = new Map(
    [...visibleOwnerIds].map((id) => [id, dormantEconomicStructureKeysFromDormancy(dormancyByPlayer.get(id))] as const)
  );
  const townNetworksByPlayerId = new Map<string, ReturnType<typeof buildConnectedTownNetworkForPlayer>>();
  for (const id of visibleOwnerIds) {
    const economyPlayer = economyPlayersById.get(id);
    if (!economyPlayer) continue;
    townNetworksByPlayerId.set(
      id,
      buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(id) ?? [], {
        maxConnectedTownNames: 16,
        dormantEconomicStructureKeys: dormantEconomicStructureKeysByPlayer.get(id) ?? new Set<string>()
      })
    );
  }
  const firstThreeTownKeysByPlayer = buildFirstThreeTownKeysByPlayer(runtimeState);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  return {
    tilesByKey,
    domainTilesByKey,
    dormantEconomicStructureKeysByPlayer,
    dockLinksByDockTileKey,
    economyPlayersById,
    townNetworksByPlayerId,
    firstThreeTownKeysByPlayer,
    nearbyWarTownKeys,
    fedTownKeysByPlayer: playerEconomy.fedTownKeysByPlayer,
    fedTownKeys: playerEconomy.fedTownKeys
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
    (tile.ownerId ? ctx.dormantEconomicStructureKeysByPlayer.get(tile.ownerId) : undefined) ?? new Set<string>()
  );
  const yieldFields = buildSnapshotTileYieldFields(tile, town, {
    ...(economyPlayer ? { player: economyPlayer } : {}),
    ...(tile.ownerId
      ? { fedTownKeys: tile.ownerId === playerId ? ctx.fedTownKeys : (ctx.fedTownKeysByPlayer.get(tile.ownerId) ?? new Set<string>()) }
      : {}),
    ...(tile.ownerId ? { firstThreeTownKeys: ctx.firstThreeTownKeysByPlayer.get(tile.ownerId) } : {}),
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
  playerEconomy: LivePlayerEconomySnapshot,
  fullVisibility = false
): RuntimeState["tiles"] => {
  const ctx = buildEnrichmentContext(runtimeState, playerEconomy, visibleTiles);
  const playersById = new Map(runtimeState.players.map((entry) => [entry.id, entry] as const));
  return visibleTiles.map((tile) => {
    const enriched = buildEnrichedTile(playerId, tile, ctx, playersById);
    // Only full-vision snapshots may derive an assignment from this map.
    // Normal views carry the authoritative, privacy-clipped wire metadata;
    // recomputing from their partial tiles could pick a different town.
    const domainTile = fullVisibility && (tile.economicStructureJson || tile.observatoryJson)
      ? ctx.domainTilesByKey.get(keyFor(tile.x, tile.y)) : undefined;
    return domainTile ? { ...enriched, ...districtOverlayProjection(ctx.domainTilesByKey, domainTile, () => true) } : enriched;
  });
};
