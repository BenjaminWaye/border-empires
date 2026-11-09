import { buildRoadNetwork, type RoadBuildDeps, type RoadDirections } from "./client-road-network.js";

/** One current world network per renderer; replacement releases the previous map.
 * At most one entry per world tile, just like buildRoadNetwork's result.
 * Camera changes never invalidate roads; tile changes always do.
 */
export const createRoadNetworkCache = (): ((deps: RoadBuildDeps, revision: number) => Map<string, RoadDirections>) => {
  let previous: { tiles: RoadBuildDeps["tiles"]; revision: number; size: number; roads: Map<string, RoadDirections> } | undefined;
  return (deps, revision) => {
    if (!previous || previous.tiles !== deps.tiles || previous.revision !== revision || previous.size !== deps.tiles.size) {
      previous = { tiles: deps.tiles, revision, size: deps.tiles.size, roads: buildRoadNetwork(deps) };
    }
    return previous.roads;
  };
};
