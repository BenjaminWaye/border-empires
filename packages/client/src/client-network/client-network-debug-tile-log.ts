import { debugTileLog, tileMatchesDebugKey } from "../client-debug/client-debug.js";
import type { Tile } from "../client-types.js";

// Extracted out of client-network.ts (500-line file cap, AGENTS.md): the
// debug-key-gated snapshot of a tile's ownership/structure/town fields that
// the network handlers log around tile updates.

type DebugTileFields = Pick<Tile, "x" | "y" | "detailLevel" | "ownerId" | "ownershipState" | "resource" | "economicStructure" | "town">;

export const createDebugTileStateLogger =
  (selectedTile: () => { x: number; y: number } | undefined) =>
  (scope: string, tile: DebugTileFields | undefined, extra?: Record<string, unknown>): void => {
    if (!tile || !tileMatchesDebugKey(tile.x, tile.y, 1, { fallbackTile: selectedTile() })) return;
    debugTileLog(scope, {
      x: tile.x,
      y: tile.y,
      detailLevel: tile.detailLevel,
      ownerId: tile.ownerId,
      ownershipState: tile.ownershipState,
      resource: tile.resource,
      economicStructure: tile.economicStructure
        ? {
            type: tile.economicStructure.type,
            status: tile.economicStructure.status
          }
        : undefined,
      town: tile.town
        ? {
            hasManufactory: tile.town.hasManufactory,
            hasIncubationEngine: tile.town.hasIncubationEngine,
            populationTier: tile.town.populationTier
          }
        : undefined,
      ...(extra ?? {})
    });
  };
