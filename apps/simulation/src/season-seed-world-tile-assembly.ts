import type { DomainTileState } from "@border-empires/game-domain";
import type { Tile, TileKey } from "@border-empires/shared";
import { prospectSignatureAt, type ClusterDefinition, type NaturalWonderSiteState, type ShardSiteState, type TownDefinition, type WatchtowerSiteState, type WaystationSiteState } from "@border-empires/game-domain";
import type { GeneratedDockState } from "./season-seed-world.js";

/**
 * Per-tile field assembly shared by the sync (season-seed-world.ts) and
 * cooperative-yield async (season-seed-world-async.ts) world builders — both
 * ran an identical inline copy of this loop body, so it's extracted once
 * here rather than duplicated (and grown again for every new per-tile
 * structure, like watchtowers).
 */
export type SeasonSeedTileAssemblyDeps = {
  clusterByTile: ReadonlyMap<TileKey, string>;
  clustersById: ReadonlyMap<string, ClusterDefinition>;
  docksByTile: ReadonlyMap<TileKey, GeneratedDockState>;
  townsByTile: ReadonlyMap<TileKey, TownDefinition>;
  ownership: ReadonlyMap<TileKey, string>;
  shardSitesByTile: ReadonlyMap<TileKey, ShardSiteState>;
  watchtowersByTile: ReadonlyMap<TileKey, WatchtowerSiteState>;
  waystationsByTile: ReadonlyMap<TileKey, WaystationSiteState>;
  naturalWondersByTile: ReadonlyMap<TileKey, NaturalWonderSiteState>;
  worldWidth: number;
  worldHeight: number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  landBiomeAt: (x: number, y: number) => Tile["landBiome"];
  townStateFromDefinition: (town: TownDefinition) => NonNullable<DomainTileState["town"]>;
};

export const buildSeasonSeedTile = (
  x: number,
  y: number,
  tk: TileKey,
  deps: SeasonSeedTileAssemblyDeps
): DomainTileState => {
  const clusterId = deps.clusterByTile.get(tk);
  const cluster = clusterId ? deps.clustersById.get(clusterId) : undefined;
  const dock = deps.docksByTile.get(tk);
  const town = deps.townsByTile.get(tk);
  const ownerId = deps.ownership.get(tk);
  const shardSite = deps.shardSitesByTile.get(tk);
  const watchtower = deps.watchtowersByTile.get(tk);
  const waystation = deps.waystationsByTile.get(tk);
  const naturalWonder = deps.naturalWondersByTile.get(tk);
  return {
    x,
    y,
    terrain: deps.terrainAt(x, y),
    landBiome: deps.landBiomeAt(x, y),
    ...(cluster?.resourceType ? { resource: cluster.resourceType } : {}),
    ...(prospectSignatureAt(x, y, deps.clustersById.values(), deps.worldWidth, deps.worldHeight)
      ? { prospectSignature: prospectSignatureAt(x, y, deps.clustersById.values(), deps.worldWidth, deps.worldHeight) }
      : {}),
    ...(dock ? { dockId: dock.dockId } : {}),
    ...(shardSite ? { shardSite: { kind: shardSite.kind, amount: shardSite.amount, ...(shardSite.expiresAt ? { expiresAt: shardSite.expiresAt } : {}) } } : {}),
    ...(watchtower ? { watchtower: { activated: watchtower.activated, ...(watchtower.activatedByPlayerId ? { activatedByPlayerId: watchtower.activatedByPlayerId } : {}) } } : {}),
    ...(waystation ? { waystation: { activated: waystation.activated, ...(waystation.activatedByPlayerId ? { activatedByPlayerId: waystation.activatedByPlayerId } : {}) } } : {}),
    ...(naturalWonder ? { naturalWonder: { type: naturalWonder.type } } : {}),
    ...(ownerId ? { ownerId, ownershipState: "SETTLED" as const } : {}),
    ...(town ? { town: deps.townStateFromDefinition(town) } : {})
  };
};
