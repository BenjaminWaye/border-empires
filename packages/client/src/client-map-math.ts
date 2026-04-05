import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "./client-state.js";

type MapMathDeps = {
  state: ClientState;
};

export const createClientMapMath = (deps: MapMathDeps) => {
  const { state } = deps;

  const ownedSpecialSiteCount = (): number => {
    let count = 0;
    for (const tile of state.tiles.values()) {
      if (tile.ownerId !== state.me) continue;
      if (tile.town || tile.dockId || tile.resource) count += 1;
    }
    return count;
  };

  const wrappedTileDistance = (x: number, y: number, focus: { x: number; y: number }): number => {
    const dx = Math.min(Math.abs(x - focus.x), WORLD_WIDTH - Math.abs(x - focus.x));
    const dy = Math.min(Math.abs(y - focus.y), WORLD_HEIGHT - Math.abs(y - focus.y));
    return dx + dy;
  };

  const toroidDelta = (from: number, to: number, dim: number): number => {
    let delta = to - from;
    if (delta > dim / 2) delta -= dim;
    if (delta < -dim / 2) delta += dim;
    return delta;
  };

  const worldToScreen = (wx: number, wy: number, size: number, halfW: number, halfH: number): { sx: number; sy: number } => {
    const dx = toroidDelta(state.camX, wx, WORLD_WIDTH);
    const dy = toroidDelta(state.camY, wy, WORLD_HEIGHT);
    return {
      sx: (dx + halfW + 0.5) * size,
      sy: (dy + halfH + 0.5) * size
    };
  };

  const manhattanToroid = (ax: number, ay: number, bx: number, by: number): number => {
    const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
    const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
    return dx + dy;
  };

  return {
    ownedSpecialSiteCount,
    wrappedTileDistance,
    toroidDelta,
    worldToScreen,
    manhattanToroid
  };
};
