import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { TileOverviewModifier } from "./client-tile-overview-modifiers.js";
import type { Tile } from "./client-types.js";

const FOUNDRY_RADIUS = 10;
const FOUNDRY_OUTPUT_MULT = 2;
const GOVERNORS_OFFICE_RADIUS = 10;
const GOVERNORS_OFFICE_UPKEEP_MULT = 0.8;
const GARRISON_HALL_RADIUS = 10;
const AIRPORT_BOMBARD_RADIUS = 30;
const RADAR_SYSTEM_RADIUS = 30;

export type TileAreaEffectModifier = TileOverviewModifier;

export type StructureAreaPreview = {
  radius: number;
  strokeStyle: string;
  fillStyle: string;
  lineDash: number[];
};

const chebyshevDistanceWrapped = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return Math.max(dx, dy);
};

const isActiveOwnedStructureWithinRange = (
  tiles: Iterable<Tile>,
  ownerId: string,
  target: Tile,
  structureType: NonNullable<Tile["economicStructure"]>["type"],
  radius: number
): boolean => {
  for (const candidate of tiles) {
    const structure = candidate.economicStructure;
    if (!structure || structure.ownerId !== ownerId || structure.type !== structureType || structure.status !== "active") continue;
    if (chebyshevDistanceWrapped(candidate.x, candidate.y, target.x, target.y) <= radius) return true;
  }
  return false;
};

export const structureAreaPreviewForTile = (tile: Tile): StructureAreaPreview | undefined => {
  const structure = tile.economicStructure;
  if (!structure) return undefined;
  if (structure.type === "FOUNDRY") {
    return {
      radius: FOUNDRY_RADIUS,
      strokeStyle: structure.status === "active" ? "rgba(255, 169, 77, 0.58)" : "rgba(255, 169, 77, 0.3)",
      fillStyle: structure.status === "active" ? "rgba(255, 169, 77, 0.08)" : "rgba(255, 169, 77, 0.035)",
      lineDash: [10, 8]
    };
  }
  if (structure.type === "GARRISON_HALL") {
    return {
      radius: GARRISON_HALL_RADIUS,
      strokeStyle: structure.status === "active" ? "rgba(255, 214, 102, 0.56)" : "rgba(255, 214, 102, 0.28)",
      fillStyle: structure.status === "active" ? "rgba(255, 214, 102, 0.07)" : "rgba(255, 214, 102, 0.03)",
      lineDash: [10, 8]
    };
  }
  if (structure.type === "GOVERNORS_OFFICE") {
    return {
      radius: GOVERNORS_OFFICE_RADIUS,
      strokeStyle: structure.status === "active" ? "rgba(141, 222, 177, 0.56)" : "rgba(141, 222, 177, 0.28)",
      fillStyle: structure.status === "active" ? "rgba(141, 222, 177, 0.07)" : "rgba(141, 222, 177, 0.03)",
      lineDash: [10, 8]
    };
  }
  if (structure.type === "RADAR_SYSTEM") {
    return {
      radius: RADAR_SYSTEM_RADIUS,
      strokeStyle: structure.status === "active" ? "rgba(120, 213, 255, 0.5)" : "rgba(120, 213, 255, 0.24)",
      fillStyle: structure.status === "active" ? "rgba(120, 213, 255, 0.045)" : "rgba(120, 213, 255, 0.02)",
      lineDash: [14, 10]
    };
  }
  if (structure.type === "AIRPORT") {
    return {
      radius: AIRPORT_BOMBARD_RADIUS,
      strokeStyle: structure.status === "active" ? "rgba(255, 132, 132, 0.52)" : "rgba(255, 132, 132, 0.24)",
      fillStyle: structure.status === "active" ? "rgba(255, 132, 132, 0.05)" : "rgba(255, 132, 132, 0.02)",
      lineDash: [12, 9]
    };
  }
  return undefined;
};

export const tileAreaEffectModifiersForTile = (tile: Tile, tiles: Iterable<Tile>): TileAreaEffectModifier[] => {
  const modifiers: TileAreaEffectModifier[] = [];
  if (!tile.ownerId || tile.fogged) return modifiers;

  if (
    tile.economicStructure?.type === "MINE" &&
    tile.economicStructure.status === "active" &&
    isActiveOwnedStructureWithinRange(tiles, tile.ownerId, tile, "FOUNDRY", FOUNDRY_RADIUS)
  ) {
    const resource = tile.resource === "IRON" ? "IRON" : tile.resource === "GEMS" ? "CRYSTAL" : undefined;
    modifiers.push({
      reason: "Foundry",
      effect: resource === "IRON" ? "+100% iron production" : resource === "CRYSTAL" ? "+100% crystal production" : "+100% mine production",
      tone: "positive"
    });
  }

  if (
    tile.ownershipState === "SETTLED" &&
    isActiveOwnedStructureWithinRange(tiles, tile.ownerId, tile, "GOVERNORS_OFFICE", GOVERNORS_OFFICE_RADIUS)
  ) {
    modifiers.push({
      reason: "Governor's Office",
      effect: "-20% upkeep",
      tone: "positive"
    });
  }

  if (
    tile.ownershipState === "SETTLED" &&
    isActiveOwnedStructureWithinRange(tiles, tile.ownerId, tile, "GARRISON_HALL", GARRISON_HALL_RADIUS)
  ) {
    modifiers.push({
      reason: "Garrison Hall",
      effect: "+20% defense",
      tone: "positive"
    });
  }

  if (isActiveOwnedStructureWithinRange(tiles, tile.ownerId, tile, "RADAR_SYSTEM", RADAR_SYSTEM_RADIUS)) {
    modifiers.push({
      reason: "Radar System",
      effect: "Blocks airport bombardment",
      tone: "positive"
    });
  }

  return modifiers;
};
