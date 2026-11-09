import type { RoadBuildDeps, RoadDirections } from "./client-road-network.js";
import { createRoadNetworkCache } from "./client-road-network-cache.js";

type CanvasRoadFrame = { roads: Map<string, RoadDirections>; builtAt: number };

/** Only the canvas renderer consumes this network. Keep its refresh floor,
 * and retain one current network rather than rebuilding it during idle frames.
 */
export const createCanvasRoadNetwork = (deps: RoadBuildDeps):
  ((nowMs: number, size: number, active3D: boolean, revision: number) => CanvasRoadFrame) => {
  const cachedRoads = createRoadNetworkCache();
  let frame: CanvasRoadFrame = { roads: new Map(), builtAt: 0 };
  return (nowMs, size, active3D, revision) => {
    if (!active3D && size >= 14 && (frame.builtAt === 0 || nowMs - frame.builtAt > 450)) {
      frame = { roads: cachedRoads(deps, revision), builtAt: nowMs };
    }
    return frame;
  };
};
