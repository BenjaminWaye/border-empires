import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";

export interface LandmarkTile {
  afc?: object | boolean | null | undefined;
  naturalWonder?: object | boolean | null | undefined;
}

export function landmarkConstructionBlocker(
  tiles: { get(key: string): LandmarkTile | undefined },
  x: number,
  y: number
): "AFC" | "relic" | undefined {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const tile = tiles.get(`${wrapX(x + dx, WORLD_WIDTH)},${wrapY(y + dy, WORLD_HEIGHT)}`);
      if (tile?.afc) return "AFC";
      if (tile?.naturalWonder) return "relic";
    }
  }
  return undefined;
}
