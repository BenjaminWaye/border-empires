import type { CommandEnvelope } from "@border-empires/sim-protocol";

import type { AutomationPlannerDiagnostic, AutomationPlannerTile } from "./automation-command-planner.js";
import type { PlannerDockView, PlannerPlayerView } from "./planner-world-view.js";

export type AiTrainingTileRecord = Pick<
  AutomationPlannerTile,
  | "x"
  | "y"
  | "terrain"
  | "ownerId"
  | "ownershipState"
  | "resource"
  | "dockId"
  | "town"
  | "fort"
  | "observatory"
  | "siegeOutpost"
  | "economicStructure"
>;

export type AiTrainingRecord = {
  recordId: string;
  source: {
    runtime: "rewrite-simulation";
    playerId: string;
    issuedAt: number;
    clientSeq: number;
    sessionPrefix: string;
  };
  plannerState: {
    player: {
      id: string;
      points: number;
      manpower: number;
      techIds?: readonly string[];
      strategicResources?: Partial<Record<string, number>>;
      settledTileCount?: number;
      townCount?: number;
      incomePerMinute?: number;
      hasActiveLock: boolean;
      activeDevelopmentProcessCount: number;
    };
    tiles: {
      owned: AiTrainingTileRecord[];
      frontier: AiTrainingTileRecord[];
      hotFrontier: AiTrainingTileRecord[];
      strategicFrontier: AiTrainingTileRecord[];
      buildCandidates: AiTrainingTileRecord[];
    };
    docks?: PlannerDockView[];
  };
  chosenAction: {
    type: string | null;
    payload: Record<string, unknown> | null;
  };
  outcome: null;
  notes: {
    diagnostic: AutomationPlannerDiagnostic;
    pendingSettlementTileKeys: string[];
  };
};

const serializeTile = (tile: AutomationPlannerTile): AiTrainingTileRecord => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.town ? { town: { ...tile.town } } : {}),
  ...(tile.fort ? { fort: { ...tile.fort } } : {}),
  ...(tile.observatory ? { observatory: { ...tile.observatory } } : {}),
  ...(tile.siegeOutpost ? { siegeOutpost: { ...tile.siegeOutpost } } : {}),
  ...(tile.economicStructure ? { economicStructure: { ...tile.economicStructure } } : {})
});

const parseCommandPayload = (command: CommandEnvelope | undefined): Record<string, unknown> | null => {
  if (!command) return null;
  try {
    return JSON.parse(command.payloadJson) as Record<string, unknown>;
  } catch {
    return { rawPayloadJson: command.payloadJson };
  }
};

export const buildAiTrainingRecord = (input: {
  player: PlannerPlayerView;
  issuedAt: number;
  clientSeq: number;
  ownedTiles: readonly AutomationPlannerTile[];
  frontierTiles: readonly AutomationPlannerTile[];
  hotFrontierTiles: readonly AutomationPlannerTile[];
  strategicFrontierTiles: readonly AutomationPlannerTile[];
  buildCandidateTiles: readonly AutomationPlannerTile[];
  pendingSettlementTileKeys: ReadonlySet<string>;
  docks?: readonly PlannerDockView[];
  command?: CommandEnvelope;
  diagnostic: AutomationPlannerDiagnostic;
}): AiTrainingRecord => ({
  recordId: `rewrite:${input.player.id}:${input.clientSeq}:${input.issuedAt}`,
  source: {
    runtime: "rewrite-simulation",
    playerId: input.player.id,
    issuedAt: input.issuedAt,
    clientSeq: input.clientSeq,
    sessionPrefix: input.diagnostic.sessionPrefix
  },
  plannerState: {
    player: {
      id: input.player.id,
      points: input.player.points,
      manpower: input.player.manpower,
      ...(input.player.techIds?.length ? { techIds: [...input.player.techIds] } : {}),
      ...(input.player.strategicResources ? { strategicResources: { ...input.player.strategicResources } } : {}),
      ...(typeof input.player.settledTileCount === "number" ? { settledTileCount: input.player.settledTileCount } : {}),
      ...(typeof input.player.townCount === "number" ? { townCount: input.player.townCount } : {}),
      ...(typeof input.player.incomePerMinute === "number" ? { incomePerMinute: input.player.incomePerMinute } : {}),
      hasActiveLock: input.player.hasActiveLock,
      activeDevelopmentProcessCount: input.player.activeDevelopmentProcessCount
    },
    tiles: {
      owned: input.ownedTiles.map(serializeTile),
      frontier: input.frontierTiles.map(serializeTile),
      hotFrontier: input.hotFrontierTiles.map(serializeTile),
      strategicFrontier: input.strategicFrontierTiles.map(serializeTile),
      buildCandidates: input.buildCandidateTiles.map(serializeTile)
    },
    ...(input.docks?.length ? { docks: input.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })) } : {})
  },
  chosenAction: {
    type: input.command?.type ?? null,
    payload: parseCommandPayload(input.command)
  },
  outcome: null,
  notes: {
    diagnostic: input.diagnostic,
    pendingSettlementTileKeys: [...input.pendingSettlementTileKeys].sort()
  }
});
