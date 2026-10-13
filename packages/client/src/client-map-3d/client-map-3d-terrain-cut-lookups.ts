// Per-rebuild road + hill-cut lookups for the true-3D terrain pass, extracted
// from client-map-3d.ts. Two lookups on purpose:
//  - roadDirsAt: the raw road network, for deciding where roads are drawn.
//  - hillCutAt: roads plus any AFC levelled pad (client-map-3d-afc-hill-cut.ts),
//    for everything that traces a hill dome's surface (dome mesh, tile
//    surface Y, road elevation, ownership/fog/prospect drapes).
import { isAfcHiddenForJoinDrop, type AfcJoinDropState } from "../client-afc-join-drop/client-afc-join-drop-state.js";
import { buildAfcPadIndex, createHillCutLookup } from "../client-map-3d-afc-hill-cut/client-map-3d-afc-hill-cut.js";
import type { RoadCutDirections } from "../client-map-3d-hill-shape.js";
import { buildRoadNetwork, type RoadDirections } from "../client-road-network/client-road-network.js";
import type { Tile } from "../client-types.js";

export type TerrainCutLookupDeps = {
  readonly tiles: Map<string, Tile>;
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly afcJoinDrop: AfcJoinDropState;
};

export type TerrainCutLookups = {
  readonly roadDirsAt: (x: number, y: number) => RoadDirections | undefined;
  readonly hillCutAt: (x: number, y: number) => RoadCutDirections | undefined;
};

export const buildTerrainCutLookups = (deps: TerrainCutLookupDeps): TerrainCutLookups => {
  const { tiles, keyFor, wrapX, wrapY } = deps;
  const roadNetwork = buildRoadNetwork({ tiles, keyFor, wrapX, wrapY });
  const roadDirsAt = (x: number, y: number): RoadDirections | undefined => roadNetwork.get(keyFor(x, y));
  const afcPads = buildAfcPadIndex({
    tiles: tiles.values(),
    keyFor,
    wrapX,
    wrapY,
    isAfcHiddenAt: (x, y) => isAfcHiddenForJoinDrop(deps.afcJoinDrop, x, y)
  });
  return { roadDirsAt, hillCutAt: createHillCutLookup(roadDirsAt, afcPads, keyFor) };
};
