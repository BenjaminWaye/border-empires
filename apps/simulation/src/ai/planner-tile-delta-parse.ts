/**
 * Pure parsing helpers for converting wire-format tile-delta JSON fields
 * (townJson/fortJson/observatoryJson/siegeOutpostJson/economicStructureJson)
 * into PlannerTileView structures. Extracted from ai-planner-worker.ts so
 * that file stays within the repo's file-line-limit gate (see AGENTS.md).
 */
import type { EconomicStructureType, Terrain } from "@border-empires/shared";
import type { PlannerTileView } from "./planner-world-view.js";

export type SimulationTileDelta = {
  x: number;
  y: number;
  terrain?: Terrain | undefined;
  resource?: string | undefined;
  dockId?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  townJson?: string | undefined;
  fortJson?: string | undefined;
  observatoryJson?: string | undefined;
  siegeOutpostJson?: string | undefined;
  economicStructureJson?: string | undefined;
};

export const parseTownSupport = (
  townJson: string | undefined
): PlannerTileView["town"] | undefined => {
  if (typeof townJson !== "string") return undefined;
  try {
    const parsed = JSON.parse(townJson) as {
      supportMax?: unknown;
      supportCurrent?: unknown;
      type?: unknown;
      name?: unknown;
      populationTier?: unknown;
    };
    return {
      ...(typeof parsed.supportMax === "number" ? { supportMax: parsed.supportMax } : {}),
      ...(typeof parsed.supportCurrent === "number" ? { supportCurrent: parsed.supportCurrent } : {}),
      ...(parsed.type === "MARKET" || parsed.type === "FARMING" ? { type: parsed.type } : {}),
      ...(typeof parsed.name === "string" ? { name: parsed.name } : {}),
      ...(parsed.populationTier === "SETTLEMENT" ||
      parsed.populationTier === "TOWN" ||
      parsed.populationTier === "CITY" ||
      parsed.populationTier === "GREAT_CITY" ||
      parsed.populationTier === "METROPOLIS"
        ? { populationTier: parsed.populationTier }
        : {})
    };
  } catch {
    return undefined;
  }
};

export const parseOwnedStructure = (
  raw: string | undefined
): { ownerId?: string; status?: string; type?: string } | undefined => {
  if (typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as { ownerId?: unknown; status?: unknown; type?: unknown };
    return {
      ...(typeof parsed.ownerId === "string" ? { ownerId: parsed.ownerId } : {}),
      ...(typeof parsed.status === "string" ? { status: parsed.status } : {}),
      ...(typeof parsed.type === "string" ? { type: parsed.type } : {})
    };
  } catch {
    return undefined;
  }
};

export const parseEconomicStructure = (
  raw: string | undefined
): { ownerId?: string; status?: string; type?: EconomicStructureType } | undefined => {
  const parsed = parseOwnedStructure(raw);
  if (!parsed) return undefined;
  return {
    ...(parsed.ownerId ? { ownerId: parsed.ownerId } : {}),
    ...(parsed.status ? { status: parsed.status } : {}),
    ...(parsed.type ? { type: parsed.type as EconomicStructureType } : {})
  };
};
