import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

export const districtWrapX = (x: number): number => wrapX(x, WORLD_WIDTH);
export const districtWrapY = (y: number): number => wrapY(y, WORLD_HEIGHT);
