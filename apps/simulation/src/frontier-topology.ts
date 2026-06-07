import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

export const frontierStepOffsets = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
] as const;

export const forEachFrontierNeighbor = (
  x: number,
  y: number,
  callback: (x: number, y: number) => void
): void => {
  for (let i = 0; i < frontierStepOffsets.length; i += 1) {
    const [dx, dy] = frontierStepOffsets[i]!;
    callback(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
  }
};
