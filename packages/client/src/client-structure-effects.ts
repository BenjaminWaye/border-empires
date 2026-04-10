import { SETTLED_DEFENSE_NEAR_FORT_RADIUS, wrappedChebyshevDistance } from "@border-empires/shared";
import { debugTileLog, tileMatchesDebugKey, verboseTileDebugEnabled } from "./client-debug.js";
import type { TileOverviewModifier } from "./client-tile-overview-modifiers.js";
import type { DomainInfo, Tile } from "./client-types.js";

const FOUNDRY_RADIUS = 10;
const GOVERNORS_OFFICE_RADIUS = 10;
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
    if (wrappedChebyshevDistance(candidate.x, candidate.y, target.x, target.y) <= radius) return true;
  }
  return false;
};

const percentLabel = (value: number): string => `${value >= 0 ? "+" : "-"}${Math.abs(Math.round(value))}%`;

const isActiveOwnedFortWithinRange = (tiles: Iterable<Tile>, ownerId: string, target: Tile, radius: number): boolean => {
  const nowMs = Date.now();
  const debugCandidates: Array<Record<string, unknown>> = [];
  const shouldDebug = verboseTileDebugEnabled() && tileMatchesDebugKey(target.x, target.y, 1, { fallbackTile: target });
  for (const candidate of tiles) {
    const fort = candidate.fort;
    if (fort && fort.ownerId === ownerId && fort.status === "active" && (fort.disabledUntil ?? 0) <= nowMs) {
      const distance = wrappedChebyshevDistance(candidate.x, candidate.y, target.x, target.y);
      if (shouldDebug) {
        debugCandidates.push({
          x: candidate.x,
          y: candidate.y,
          source: "fort",
          status: fort.status,
          disabledUntil: fort.disabledUntil ?? null,
          ownerId: fort.ownerId,
          distance,
          inRange: distance <= radius
        });
      }
      if (distance <= radius) {
        if (shouldDebug) {
          debugTileLog("stone-curtain-fort-scan", {
            target: {
              x: target.x,
              y: target.y,
              ownerId: target.ownerId,
              ownershipState: target.ownershipState,
              detailLevel: target.detailLevel
            },
            radius,
            matched: true,
            matchSource: "fort",
            candidates: debugCandidates
          });
        }
        return true;
      }
    }
    const structure = candidate.economicStructure;
    if (!structure || structure.ownerId !== ownerId || structure.status !== "active" || structure.type !== "WOODEN_FORT") continue;
    const distance = wrappedChebyshevDistance(candidate.x, candidate.y, target.x, target.y);
    if (shouldDebug) {
      debugCandidates.push({
        x: candidate.x,
        y: candidate.y,
        source: "wooden_fort",
        status: structure.status,
        ownerId: structure.ownerId,
        distance,
        inRange: distance <= radius
      });
    }
    if (distance <= radius) {
      if (shouldDebug) {
        debugTileLog("stone-curtain-fort-scan", {
          target: {
            x: target.x,
            y: target.y,
            ownerId: target.ownerId,
            ownershipState: target.ownershipState,
            detailLevel: target.detailLevel
          },
          radius,
          matched: true,
          matchSource: "wooden_fort",
          candidates: debugCandidates
        });
      }
      return true;
    }
  }
  if (shouldDebug) {
    debugTileLog("stone-curtain-fort-scan", {
      target: {
        x: target.x,
        y: target.y,
        ownerId: target.ownerId,
        ownershipState: target.ownershipState,
        detailLevel: target.detailLevel
      },
      radius,
      matched: false,
      candidates: debugCandidates
    });
  }
  return false;
};

export const settledDefenseNearFortDomainModifiers = (domainCatalog: DomainInfo[], domainIds: string[]): TileAreaEffectModifier[] => {
  const domainById = new Map(domainCatalog.map((domain) => [domain.id, domain]));
  const modifiers: TileAreaEffectModifier[] = [];
  for (const id of domainIds) {
    const value = domainById.get(id)?.effects?.settledDefenseNearFortMult;
    if (typeof value !== "number" || value === 1) continue;
    const domain = domainById.get(id);
    if (!domain) continue;
    modifiers.push({
      reason: domain.name,
      effect: `${percentLabel((value - 1) * 100)} defense near forts`,
      tone: "positive"
    });
  }
  return modifiers;
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

export const tileAreaEffectModifiersForTile = (
  tile: Tile,
  tiles: Iterable<Tile>,
  settledDefenseNearFortModifiers: TileAreaEffectModifier[] = []
): TileAreaEffectModifier[] => {
  const modifiers: TileAreaEffectModifier[] = [];
  if (!tile.ownerId || tile.fogged) return modifiers;
  const shouldDebug = verboseTileDebugEnabled() && tileMatchesDebugKey(tile.x, tile.y, 1, { fallbackTile: tile });

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

  if (
    tile.ownershipState === "SETTLED" &&
    settledDefenseNearFortModifiers.length > 0 &&
    isActiveOwnedFortWithinRange(tiles, tile.ownerId, tile, SETTLED_DEFENSE_NEAR_FORT_RADIUS)
  ) {
    modifiers.push(...settledDefenseNearFortModifiers);
  }

  if (isActiveOwnedStructureWithinRange(tiles, tile.ownerId, tile, "RADAR_SYSTEM", RADAR_SYSTEM_RADIUS)) {
    modifiers.push({
      reason: "Radar System",
      effect: "Protected from airport strikes",
      tone: "positive"
    });
  }

  if (shouldDebug) {
    debugTileLog("stone-curtain-area-modifiers", {
      tile: {
        x: tile.x,
        y: tile.y,
        ownerId: tile.ownerId,
        ownershipState: tile.ownershipState,
        detailLevel: tile.detailLevel,
        fogged: tile.fogged
      },
      radius: SETTLED_DEFENSE_NEAR_FORT_RADIUS,
      settledDefenseNearFortModifiers,
      resultingModifiers: modifiers
    });
  }

  return modifiers;
};
