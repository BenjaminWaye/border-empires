import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

export const isFrontierAdjacent = (fromX: number, fromY: number, toX: number, toY: number): boolean => {
  const dx = Math.min(Math.abs(fromX - toX), WORLD_WIDTH - Math.abs(fromX - toX));
  const dy = Math.min(Math.abs(fromY - toY), WORLD_HEIGHT - Math.abs(fromY - toY));
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
};
