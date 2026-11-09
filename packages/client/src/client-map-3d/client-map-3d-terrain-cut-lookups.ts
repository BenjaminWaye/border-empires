import { createRoadNetworkCache } from "../client-road-network/client-road-network-cache.js";
// Per-rebuild road + hill-cut lookups for the true-3D terrain pass, extracted
// from client-map-3d.ts. Two lookups on purpose:
//  - roadDirsAt: the raw road network, for deciding where roads are drawn.
//  - hillCutAt: roads plus any AFC levelled pad (client-map-3d-afc-hill-cut.ts)
//    or fishing-site pad (client-map-3d-fishing/fishing-hill-cut.ts),
//    for everything that traces a hill dome's surface (dome mesh, tile
//    surface Y, road elevation, ownership/fog/prospect drapes).
import { isAfcHiddenForJoinDrop, type AfcJoinDropState } from "../client-afc-join-drop/client-afc-join-drop-state.js";
import { buildAfcPadIndex, createHillCutLookup } from "../client-map-3d-afc-hill-cut/client-map-3d-afc-hill-cut.js";
import { buildFishingPadIndex } from "../client-map-3d-fishing/fishing-hill-cut.js";
import type { RoadCutDirections } from "../client-map-3d-hill-shape.js";
import type { RoadDirections } from "../client-road-network/client-road-network.js";
import type { Tile } from "../client-types.js";

export type TerrainCutLookupDeps = {
  readonly tiles: Map<string, Tile>;
  readonly tilesRevision: number;
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly afcJoinDrop: AfcJoinDropState;
  readonly isHillsAt: (x: number, y: number) => boolean;
  readonly isWaterAt: (x: number, y: number) => boolean;
  readonly isFishingSiteDrawnAt: (x: number, y: number) => boolean;
};

export type TerrainCutLookups = {
  readonly roadDirsAt: (x: number, y: number) => RoadDirections | undefined;
  readonly hillCutAt: (x: number, y: number) => RoadCutDirections | undefined;
};

export const createTerrainCutLookupBuilder = (): ((deps: TerrainCutLookupDeps) => TerrainCutLookups) => {
  const roads = createRoadNetworkCache();
  return (deps) => {
    const { tiles, keyFor, wrapX, wrapY } = deps;
    const roadNetwork = roads({ tiles, keyFor, wrapX, wrapY }, deps.tilesRevision);
    const roadDirsAt = (x: number, y: number): RoadDirections | undefined => roadNetwork.get(keyFor(x, y));
    const afcPads = buildAfcPadIndex({
      tiles: tiles.values(),
      keyFor,
      wrapX,
      wrapY,
      isAfcHiddenAt: (x, y) => isAfcHiddenForJoinDrop(deps.afcJoinDrop, x, y)
    });
    const fishingPads = buildFishingPadIndex({ tiles: tiles.values(), keyFor, wrapX, wrapY, isHillsAt: deps.isHillsAt, isWaterAt: deps.isWaterAt, isSiteDrawnAt: deps.isFishingSiteDrawnAt });
    return { roadDirsAt, hillCutAt: createHillCutLookup(roadDirsAt, afcPads, keyFor, fishingPads) };
  };
};
