import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

export const frontierStepOffsets = [
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 }
] as const;

export const frontierNeighborCoords = (x: number, y: number): Array<{ x: number; y: number }> =>
  frontierStepOffsets.map(({ dx, dy }) => ({
    x: wrapX(x + dx, WORLD_WIDTH),
    y: wrapY(y + dy, WORLD_HEIGHT)
  }));

export const frontierNeighborKeys = (x: number, y: number): string[] =>
  frontierNeighborCoords(x, y).map((coords) => `${coords.x},${coords.y}`);
